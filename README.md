# NEXORA POS — offline-first retail point of sale (frontend only)

A complete, responsive **frontend-only** POS for a single retail store. It runs entirely in the
browser: data lives in **IndexedDB**, the app is an installable **PWA**, and it keeps working with
no internet connection.

> **No backend. No database server. No Supabase. No real authentication.**
> Synchronisation is **simulated** and role switching is a **UI demonstration**. See
> [What this is *not*](#what-this-is-not).

## Stack

| Concern | Choice |
| --- | --- |
| Framework | **Next.js 16** (App Router) in **static-export** mode: `output: 'export'`, no Node server |
| UI | React 19 + TypeScript (strict) |
| Styling | Tailwind CSS v4 (design tokens from the prototype in `src/app/globals.css`) |
| Routing | Next.js App Router (`src/app/*`) |
| Icons | Lucide React |
| Charts | Recharts (code-split with the routes that use it) |
| Persistence | IndexedDB (small in-house wrapper, no dependency) |
| Offline | Hand-written service worker, generated at build time (`scripts/`) |
| Tests | Vitest + fake-indexeddb |

**Vite has been removed** from the app. (`vitest`, the test runner, bundles its own copy of Vite internally;
the app is built only by Next.js.) Next.js runs here as a pure frontend: every route is pre-rendered to static
files in `out/`, so there is no server, API route or database.

## Quick start

Requires **Node.js 20+**. The commands are identical in PowerShell, CMD, macOS and Linux.

```bash
npm install
npm run dev        # http://localhost:3000  (hot reload; no service worker in dev)
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Type-check + static export into `out/`, then generate the service worker (`out/sw.js`) |
| `npm run preview` | Serve `out/` at http://localhost:3000 — **use this to test offline** |
| `npm test` | Run the unit tests once |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript only |

## Testing offline functionality

Service workers are only registered in the **production build**, so don’t test offline with `npm run dev`.

1. `npm run build` then `npm run preview`, open http://localhost:3000.
2. Wait for the toast **“Ready to work offline.”** (Settings → *App & offline* shows “Cached · works offline”).
3. Chrome/Edge DevTools → **Network** tab → set throttling to **Offline** (or *Application → Service Workers → Offline*).
   The top-bar pill turns **Offline**.
4. **Reload the page.** It still loads — the shell comes from the service worker cache, your data from IndexedDB.
5. Ring up a sale. The top bar shows **“N pending”**; click it to open **Sync status** and inspect each queued operation (with its JSON payload).
6. Set the network back to **Online**. After a moment the queue drains (“Synced”). You can also press **Sync now**.

Handy demo controls (no DevTools needed): click the **Online/Offline pill** in the top bar, or open
**Sync status** → *Simulate offline mode* and *Fail the next sync* (shows failure → retry).

**Persistence check:** add a product, close the browser completely, reopen — it’s still there.
**Reset everything:** Settings → *Your data* (Reset demo data / Delete all), or DevTools → Application → *Clear site data*.
**Install:** Chromium browsers show *Install* in Settings → *App & offline* (or the address bar); on iOS use Share → *Add to Home Screen*.

## Features

- **Dashboard** — today’s revenue, transactions, active products, low-stock count, 7-day chart, alerts, recent sales.
- **POS checkout** — search by name/SKU/barcode (scanner-friendly: barcode + Enter adds to cart; `/` focuses search), category filter,
  cart with quantity limits from live stock, fixed/percent discount, configurable tax (added or included), payment method,
  cash tendered + change, confirmation step, success screen with receipt.
- **Products** — add / edit / delete / search / filter; name, SKU, barcode, category, price, cost, stock; inline validation (unique SKU/barcode).
- **Inventory** — stock levels, restock, count adjustment with reason, low/out-of-stock warnings, full movement history.
- **Sales history** — search, date presets + custom range, payment/sync filters, sale details, receipt, CSV export.
- **Receipts** — store info, items, totals, payment, transaction ID; 58 mm / 80 mm; prints only the receipt (`window.print`).
- **Reports** — daily/monthly summaries, revenue chart, best sellers, payment mix, inventory valuation, CSV export.
- **Staff** — Administrator / Cashier demo roles (see below).
- **Settings** — store info, currency, tax, receipt options (with live preview), low-stock threshold, categories, auto-sync, backup/reset.

First launch loads **30 days of demo data** (stock history is consistent with the sales). Reset or clear it in Settings.

## Roles (demonstration only)

Switch user from the avatar menu or *Staff & settings*. **Cashier** can sell, view products/stock/own sales; **Administrator** can also
edit products, restock, see costs/profit, view reports and change settings.

This is **not security**. The checks live in the browser (`src/config/permissions.ts`); anyone with dev-tools can bypass them and all data
is stored locally anyway. Real authorization must be enforced by a server.

## What this is *not*

- **Not multi-device.** Data lives in one browser profile. Other devices/users can’t see it.
- **Sync is simulated.** “Syncing” marks queued operations as done locally; nothing is sent anywhere.
- **Browser storage can be cleared** by the user or (rarely, under storage pressure) the browser. The app requests persistent storage,
  but export a backup (Settings → *Your data*) for anything important.
- **Not a payment system.** No card/mobile-money processing; the payment method is just recorded.

## Project structure

```
src/
  app/         Next.js App Router: layout, providers, one tiny page.tsx per route, 404
  screens/     the seven page components (Dashboard, Checkout, Products, Inventory, Sales, Reports, Settings)
  config/      brand, routes, permissions, constants (mock users, currencies, defaults)
  types/       shared TypeScript types
  lib/         pure logic: calc (totals/tax), analytics, validation, format, csv, motion (springs)
  db/          idb.ts (transactional wrapper) · commands.ts (atomic writes) · snapshot.ts · seed.ts
  services/    sync.ts — queue runner + SyncTransport interface (simulated)
  store/       StoreProvider (data + actions) · CartProvider · PrintProvider
  hooks/       online status, media queries, install prompt, service worker
  components/  ui/ (Button, Dialog, Toast, Fields…) · layout/ · receipt/ · sync/ · products/ · charts/
scripts/       build-sw.mjs + sw.template.js — generate the service worker after `next build`
public/        manifest.webmanifest, icons
```

`src/screens` is deliberately *not* called `src/pages`: Next.js would treat that as the legacy Pages Router.

Business rules (totals, tax, discounts, stock checks, analytics) are pure functions in `src/lib` and `src/db/commands.ts`, covered by tests,
and independent of React.

## Backend readiness

Every mutation is one **atomic IndexedDB transaction** that writes the change, the stock movement(s) *and* a `SyncOperation` to the queue.
Each operation carries an `id` (usable as an idempotency key), a per-device monotonic `seq` (replay order), entity/action and a payload.

To add a backend later:

1. Implement `SyncTransport.push(ops)` in `src/services/sync.ts` with a real HTTP call (return one result per op).
2. Swap `createSimulatedTransport()` for it in `src/store/StoreProvider.tsx`.
   (If you later need server features such as API routes, remove `output: 'export'` from `next.config.mjs` and move the secrets/logic server-side.)
3. Replace the mock users with real auth and enforce permissions server-side.
4. Decide conflict rules (e.g. stock is best merged as *movements*, which this app already records).

No page or component needs to change.

## Design notes

The prototype’s palette, spacing, cards and layout are preserved. Added polish follows Apple-style interface principles:
dialogs are driven by interruptible springs; on phones they become **bottom sheets you can drag away** (1:1 tracking, rubber-banding,
momentum-aware dismissal); press feedback is instant; top bars use a translucent material that falls back to solid for
*reduced transparency / increased contrast*; *reduced motion* swaps movement for cross-fades; focus is trapped and restored in dialogs;
inputs are 16 px on phones to avoid iOS zoom. The prototype had no dark theme, so none was added.

## Notes

- **Deploying:** upload the contents of `out/` to any static host (Netlify, Vercel static, GitHub Pages, S3, nginx…). Routes are exported as `/checkout/index.html` etc. (`trailingSlash: true`). Under a sub-path, set `basePath` in `next.config.mjs` and adjust `scope`/`start_url` in `public/manifest.webmanifest` and the `/sw.js` path in `src/hooks/useServiceWorker.ts`.
- **How offline works:** after `next build`, `scripts/build-sw.mjs` lists every exported file (pages, JS, CSS, icons and Next’s navigation payloads) and writes `out/sw.js`. The worker precaches all of it on first visit, serves pages from that cache, and when a new version is deployed it waits until the user taps **Reload** (never swapping code mid-sale). Business data is never cached by the worker; it lives in IndexedDB.
- **Branding:** the product name is centralised in `src/config/brand.ts`; the PWA names are in `public/manifest.webmanifest`.
- Replace the PWA icons in `public/icons/` with your logo.
