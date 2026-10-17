export type UserRole = 'owner' | 'cashier';

/**
 * Public, sanitized user entity suitable for client-facing responses
 * and audit contexts. Never contains password hashes or PIN hashes.
 */
export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isOwner: boolean;
  initials: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Internal storage representation of a user record.
 * Contains sensitive credential hashes and security state.
 * Never send directly to client API callers.
 */
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  pinHash: string;
  role: UserRole;
  isOwner: boolean;
  initials: string;
  active: boolean;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input payload for initial store owner registration.
 */
export interface CreateOwnerInput {
  name: string;
  email: string;
  passwordHash: string;
  initials: string;
}

/**
 * Input payload for creating a cashier account.
 */
export interface CreateCashierInput {
  name: string;
  pinHash: string;
  initials: string;
  active?: boolean;
}

/**
 * Input payload for updating existing user details.
 */
export interface UpdateUserInput {
  name?: string;
  email?: string;
  initials?: string;
  active?: boolean;
  passwordHash?: string;
  pinHash?: string;
}

/**
 * Account authentication status check result.
 */
export interface UserAuthStatus {
  exists: boolean;
  active: boolean;
  isLocked: boolean;
  pinLockedUntil: Date | null;
  failedPinAttempts: number;
}

/**
 * PIN increment outcome.
 */
export interface PinAttemptResult {
  failedPinAttempts: number;
  isLocked: boolean;
  pinLockedUntil: Date | null;
}

/**
 * Internal session record stored by the session store.
 */
export interface SessionRecord {
  id: string;
  tokenHash: string;
  userId: string;
  role: UserRole;
  name: string;
  userAgent: string;
  ipAddress: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input payload for session generation.
 */
export interface CreateSessionInput {
  tokenHash: string;
  userId: string;
  role: UserRole;
  name: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
}

/**
 * Sanitized session representation.
 */
export interface SessionContext {
  id: string;
  userId: string;
  role: UserRole;
  name: string;
  expiresAt: Date;
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec?: number;
  resetAt?: Date;
}
