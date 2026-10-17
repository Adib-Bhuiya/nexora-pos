# Nexora POS: Hardened Authentication Architecture & Implementation Plan

A comprehensive, production-grade authentication, authorization, session security, and refund integrity specification for Nexora POS (Next.js 16 App Router + MongoDB Atlas + Mongoose).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> This final specification incorporates all six requested architecture corrections:
> 1. **Rate Limiting Architecture**:
>    - **Production**: Backed by a MongoDB `RateLimit` collection with native TTL expiration (`expiresAt`), guaranteeing rate limits survive serverless cold starts, auto-scaling instances, and pod restarts.
>    - **Development/Test Fallback**: Explicit in-memory fallback activated strictly when MongoDB is disconnected or in unit test runners.
>    - **Trusted Proxy IP Resolution**: Client IP addresses are derived from `x-forwarded-for` only when `TRUST_PROXY=true` or trusted proxy environment headers are verified; otherwise falls back to direct connection remote address or loopback.
> 2. **Line-Item Refund Integrity**:
>    - Avoids naive completed/refunded boolean flags. Tracks `refundedQty` per line item and maintains a detailed `refunds` subdocument history.
>    - Rejects over-refunding (`requestedQty + item.refundedQty > item.qty`) and duplicate concurrent refunds.
>    - **Execution Strategy**: Where replica sets/transactions are supported, uses multi-document transactions to update the sale, restore product inventory, and write stock movement audit logs. On standalone instances without transactions, uses atomic conditional queries (`Sale.findOneAndUpdate` with filter `items.refundedQty: { $lte: originalQty - requestedQty }`) with compensating rollbacks.
> 3. **Consistent Audit Attribution & Data Types**:
>    - `refundedAt` is strictly typed as a native BSON `Date`.
>    - `refundedBy` uses the same identifier type as the `User` model (`Schema.Types.ObjectId` or stringified ObjectId).
>    - Cashier identity and audit attribution always resolve from the fresh live MongoDB `User` record, stamping the real database user name and ID.
> 4. **Strict Zero-User Setup Gate**:
>    - The setup endpoint rejects initialization if **any user already exists** (`await User.countDocuments() > 0`), not merely if an owner exists.
>    - The programmatic unique partial index `{ isOwner: 1 }` (`unique: true, partialFilterExpression: { isOwner: true }`) is maintained as the database-level concurrency safeguard.
>    - Strict server-side validation enforces 8+ character owner passwords and 6-digit numeric cashier PINs (`/^\d{6}$/`).
> 5. **Server-Side APP_URL Origin Allowlist & CSRF**:
>    - Rejects client-controlled host headers.
>    - Strictly validates `Origin` and `Referer` against a server-side `APP_URL` allowlist (plus `localhost:3000` in development).
>    - Enforces mandatory `X-Requested-With: NexoraPOS` custom header for all mutating browser requests.
> 6. **Zero Incompatible Migrations**:
>    - Retains full backward compatibility with existing `Sale`, `Product`, `StockMovement`, and `Settings` documents. All refund fields on `Sale` are additive with default values.

---

## 1. System Architecture & Threat Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT TERMINAL                                  │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│    First-Run Wizard      │   Owner / Staff Login    │   POS Terminal View   │
│  (Shown if 0 users exist)│ (Email/Pass or 6-Dig PIN)│ (Checkout, Cart, Sale)│
└────────────┬─────────────┴────────────┬─────────────┴───────────┬───────────┘
             │                          │                         │
             │ POST /api/auth/setup     │ POST /api/auth/login    │ Authenticated
             │ (Pre-hashed timing-safe  │ Sets HttpOnly cookie:   │ Mutating Requests:
             │  OWNER_SETUP_KEY check)  │ nexora_session=<rawToken│ + Cookie: nexora_session
             ▼                          ▼                         │ + X-Requested-With
┌─────────────────────────────────────────────────────────────────┼───────────┐
│                     SERVER-SIDE SECURITY LAYER                  ▼           │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Shared Rate Limiter (MongoDB RateLimit collection with TTL index)       │
│  2. Strict Origin/Referer verification against server-side APP_URL allowlist│
│  3. Custom Header Guard (X-Requested-With: NexoraPOS)                       │
│  4. Token Hashing: tokenHash = SHA-256(rawToken)                            │
│  5. Session Expiry Check against MongoDB Session collection                 │
│  6. Live User Lookup: Query User document to verify active status and role  │
│  7. Role-Based Authorization Guard (requireRole(['owner']) vs cashier scope)│
└───────────┬───────────────────────────┬─────────────────────────┬───────────┘
            │                           │                         │
            ▼                           ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MONGODB ATLAS CLUSTER                              │
├────────────────────────┬────────────────────────┬───────────────────────────┤
│    users collection    │  sessions collection   │  business collections     │
│  - Programmatic unique │  - tokenHash (indexed) │  - sales (with refunds)   │
│    partial index:      │  - expiresAt (TTL idx) │  - products, movements,   │
│    { isOwner: true }   │  - userId (ref: User)  │    settings               │
│  - 6-digit pinHash     │  - role: owner/cashier │  - ratelimits (TTL idx)   │
│  - failedPinAttempts   │                        │                           │
└────────────────────────┴────────────────────────┴───────────────────────────┘
```

---

## 2. Hardened Security Mechanics

### 2.1 Shared Rate Limiting (`RateLimit` Collection)
- **Schema**:
  ```typescript
  const RateLimitSchema = new Schema({
    key: { type: String, required: true, unique: true }, // e.g. "login:ip:192.168.1.1" or "pin:user:..."
    count: { type: Number, required: true, default: 1 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  });
  ```
- **Proxy-Aware Client IP Extraction**:
  - Direct connection IP is used by default.
  - Proxy header `x-forwarded-for` is used only when `process.env.TRUST_PROXY === 'true'` or in trusted cloud deployments.
- **Thresholds**:
  - Initial setup: 5 attempts per IP per hour.
  - Owner login: 5 failed attempts per IP per 15 minutes.
  - Cashier PIN: 5 failed attempts per cashier locks the account for 15 minutes (`pinLockedUntil` on the User document).

### 2.2 Initial Owner Setup Guard
1. **Zero-User Database Gate**:
   - Rejects if `await User.countDocuments() > 0`. Setup is permanently disabled once the first account exists.
2. **Programmatic Index Verification**:
   - Runs `ensureAuthIndexes()` before handling setup to guarantee `{ isOwner: 1 }` exists in MongoDB with `{ unique: true, partialFilterExpression: { isOwner: true } }`.
3. **Pre-Hashed Constant-Length Key Check**:
   - Hashes both `process.env.OWNER_SETUP_KEY` and the user-supplied key with SHA-256 before `crypto.timingSafeEqual`, preventing length-mismatch exceptions and timing attacks.
4. **Server-Side Validation**:
   - Email format: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - Password: Minimum 8 characters, requiring at least one letter and one number.
   - Optional owner PIN: Must be exactly 6 digits (`/^\d{6}$/`).

### 2.3 Strict Server-Side Origin & CSRF Defense
- Production origin validation checks incoming `Origin` and `Referer` headers against an explicit server-side allowlist:
  - Allowed origin list is derived from `process.env.APP_URL` (e.g. `https://pos.nexora.app`).
  - In development, `http://localhost:3000` and `http://127.0.0.1:3000` are permitted.
  - Rejects requests with mismatched origins or missing origin headers on mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) with `403 Forbidden`.
  - Mandates `X-Requested-With: NexoraPOS` header on all API client requests.

### 2.4 Live Database Authorization on Every Request
- `getSessionUser(req)`:
  1. Computes `tokenHash = SHA256(cookieToken)`.
  2. Queries active session in MongoDB.
  3. Queries the **live `User` document** from MongoDB by `session.userId`.
  4. If `!user` or `user.active !== true`:
     - Immediately invalidates all active sessions for that user.
     - Responds with `401 Unauthorized`.
  5. Derives permissions dynamically from the fresh `user.role` record.

### 2.5 Refund Integrity & Line-Item Tracking
1. **Schema Additions on `Sale` (Backward-Compatible)**:
   - On each item in `Sale.items`:
     `refundedQty: { type: Number, default: 0, min: 0 }`
   - On `Sale` root:
     `status: { type: String, enum: ['completed', 'partially_refunded', 'refunded'], default: 'completed' }`
     `refunds: [RefundSchema]`
2. **`RefundSchema` Details**:
   - `refundId`: string (`ref_${nanoid()}`)
   - `refundReceipt`: string (`RF-${receipt}-${seq}`)
   - `refundedAt`: `Date` (strictly typed as `Date`)
   - `refundedBy`: `string` (User ID matching User model)
   - `refundedByName`: `string` (Resolved from fresh `User` document)
   - `reason`: `string`
   - `items`: `[{ productId, name, sku, qty, price, cost }]`
   - `amount`: `number` (positive refunded amount)
3. **Atomic Execution Strategy**:
   - **With Replica Set / Transaction Support**:
     Runs inside `withTransactionIfSupported`:
     1. Validates `item.refundedQty + requestedQty <= item.qty` for all requested items.
     2. Updates sale: `$inc: { "items.$[elem].refundedQty": qty }`, pushes refund record, updates status.
     3. Restores stock: `Product.updateOne({ _id: item.productId }, { $inc: { stock: qty } })`.
     4. Creates audit log: `StockMovement.create({ type: 'adjustment', change: +qty, note: 'Refund for receipt ${sale.receipt}', actorName: user.name })`.
   - **Without Multi-Document Transactions (Standalone MongoDB)**:
     1. Uses atomic conditional update on Sale:
        `Sale.findOneAndUpdate({ _id: saleId, "items.productId": item.productId, "items.refundedQty": { $lte: originalQty - qty } }, ...)`
        If matched count is 0, request fails immediately, preventing over-refunds.
     2. Sequentially restores product inventory and creates audit movements. If an inventory step fails, compensating update reverses the sale's refunded quantities.

---

## 3. Data Models Specification

### 3.1 `src/models/User.ts`
```typescript
const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  passwordHash: { type: String },
  pinHash: { type: String },
  role: { type: String, enum: ['owner', 'cashier'], required: true },
  isOwner: { type: Boolean, default: false },
  initials: { type: String, required: true },
  active: { type: Boolean, default: true },
  failedPinAttempts: { type: Number, default: 0 },
  pinLockedUntil: { type: Date, default: null },
}, { timestamps: true });

UserSchema.index({ isOwner: 1 }, { unique: true, partialFilterExpression: { isOwner: true } });
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } });
```

### 3.2 `src/models/Session.ts`
```typescript
const SessionSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['owner', 'cashier'], required: true },
  name: { type: String, required: true },
  userAgent: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });
```

### 3.3 `src/models/RateLimit.ts`
```typescript
const RateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 1 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});
```

### 3.4 `src/models/Sale.ts` (Additive, Non-Breaking)
```typescript
const RefundItemSchema = new Schema({
  productId: { type: String, required: true },
  name: { type: String, required: true },
  sku: { type: String, required: true },
  qty: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  cost: { type: Number, required: true, min: 0 },
}, { _id: false });

const RefundSchema = new Schema({
  refundId: { type: String, required: true },
  refundReceipt: { type: String, required: true },
  refundedAt: { type: Date, required: true },
  refundedBy: { type: String, required: true },
  refundedByName: { type: String, required: true },
  reason: { type: String, required: true, trim: true },
  items: { type: [RefundItemSchema], required: true },
  amount: { type: Number, required: true, min: 0 },
}, { _id: false });
```

---

## 4. Staged Implementation Plan

### Stage 1: Security Core, Rate Limiting & Models
- Guarantee database models (`User.ts`, `Session.ts`, `RateLimit.ts`, `Sale.ts`).
- Ensure `src/lib/auth-server.ts` incorporates:
  - `ensureAuthIndexes()`
  - Constant-length pre-hashed `verifySetupKey`
  - MongoDB `RateLimit` with in-memory test fallback
  - `verifyCsrfAndOrigin` against `APP_URL`
  - `hashToken`, `createSession`, `getSessionUser` resolving live `User`
- **Verification**: Run unit tests in `src/test/auth-security.test.ts`.

### Stage 2: Authentication & User API Endpoints
- Implement/verify:
  - `POST /api/auth/setup-owner`: Zero-user check (`countDocuments() === 0`), `OWNER_SETUP_KEY` check, unique partial index race handling.
  - `POST /api/auth/login`: Owner email/password login with shared rate limiting.
  - `POST /api/auth/pin-login`: Cashier 6-digit PIN login with 15-minute lockout.
  - `POST /api/auth/logout`: Revokes session.
  - `GET /api/auth/status`: Returns setup requirement and live authenticated user.
  - `GET /api/users`, `POST /api/users`, `PATCH /api/users/[id]`: Owner-only cashier management.
- **Verification**: Run auth API route tests.

### Stage 3: API Route Hardening, Cashier Stamping & Refunds
- Ensure all mutating routes check CSRF and require appropriate roles (`owner` vs `cashier`).
- `POST /api/sales`: Enforce cashierId/cashierName stamping from live authenticated user.
- `POST /api/sales/[id]/refund`: Line-item refund validation, over-refund prevention, stock restoration, and audit logging.
- `POST /api/clear-data`: Owner-only; strictly preserve `User`, `Session`, and `RateLimit`.
- Update unit tests in `src/test/api.test.ts` to include required CSRF/auth headers for handler invocation.
- **Verification**: Run `npm test` across all test files.

### Stage 4: Role Migration & POS Frontend Integration
- Role migration: Align UI permission checks from `admin` to `owner`.
- Update API client utilities (`product-api.ts`, `database-api.ts`, etc.) to pass `X-Requested-With: NexoraPOS` and session credentials.
- Update `src/store/StoreProvider.tsx` with live authentication state and auth status polling.
- Implement Initial Setup Modal, PIN Keypad Modal, and Topbar profile switcher.
- Add Staff Management in Settings screen.
- Add Refund dialog in Sale history for owners.
- **Verification**: Run `compile_applet` and test POS interactions.

### Stage 5: Final Security Audit & Verification Report
- Run the full test suite with Vitest.
- Report changed files, test results, and status for each security requirement.
