import type {
  CreateCashierInput,
  CreateOwnerInput,
  CreateSessionInput,
  PinAttemptResult,
  RateLimitResult,
  SafeUser,
  SessionRecord,
  UpdateUserInput,
  UserAuthStatus,
  UserRecord,
} from './types';

/**
 * Contract for user persistence operations.
 * Completely decoupled from database engines and ORMs.
 */
export interface IUserRepository {
  /**
   * Look up a user record by normalized email address.
   */
  findByEmail(email: string): Promise<UserRecord | null>;

  /**
   * Look up a user record by unique identifier.
   */
  findById(id: string): Promise<UserRecord | null>;

  /**
   * List all cashier accounts formatted as safe user summaries.
   * Excludes password and PIN hashes.
   */
  listCashiers(): Promise<SafeUser[]>;

  /**
   * Count the total number of users currently registered.
   */
  countUsers(): Promise<number>;

  /**
   * Count the number of store owners currently registered.
   */
  countOwners(): Promise<number>;

  /**
   * Atomically create the initial store owner account.
   * Throws an error if an owner already exists or if email collides.
   */
  createOwner(data: CreateOwnerInput): Promise<UserRecord>;

  /**
   * Create a new cashier account.
   */
  createCashier(data: CreateCashierInput): Promise<UserRecord>;

  /**
   * Update permitted profile or credential fields on a user record.
   */
  updateUser(id: string, updates: UpdateUserInput): Promise<UserRecord | null>;

  /**
   * Delete a cashier account by ID.
   * Refuses to delete store owners to protect system integrity.
   */
  deleteCashier(id: string): Promise<boolean>;

  /**
   * Atomically increment failed PIN attempts and apply a time lock
   * if the threshold is reached or exceeded.
   */
  incrementFailedPinAttempts(
    id: string,
    maxAttempts?: number,
    lockDurationMs?: number
  ): Promise<PinAttemptResult>;

  /**
   * Reset failed PIN attempts and clear any existing lock.
   */
  resetFailedPinAttempts(id: string): Promise<void>;

  /**
   * Explicitly lock a cashier account until a specified date/time.
   */
  lockPinAccount(id: string, until: Date): Promise<void>;

  /**
   * Check authentication status and retrieve lockout/active metadata.
   */
  getAuthStatus(id: string): Promise<UserAuthStatus>;
}

/**
 * Contract for session storage and verification operations.
 * Completely decoupled from database engines and ORMs.
 */
export interface ISessionRepository {
  /**
   * Persist a newly created session record with expiry date and client metadata.
   */
  createSession(data: CreateSessionInput): Promise<SessionRecord>;

  /**
   * Retrieve an active (non-expired) session by the SHA-256 hash of its token.
   * Returns null if not found or if the session has expired.
   */
  findActiveSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;

  /**
   * Revoke an active session by token hash.
   * Returns true if a session was found and removed.
   */
  revokeSessionByTokenHash(tokenHash: string): Promise<boolean>;

  /**
   * Revoke all active sessions belonging to a specific user.
   * Used on logout from all devices, user deactivation, or role changes.
   * Returns the count of revoked sessions.
   */
  revokeAllUserSessions(userId: string): Promise<number>;

  /**
   * Clean up expired sessions from storage.
   * Returns the count of purged sessions.
   */
  purgeExpiredSessions(): Promise<number>;
}

/**
 * Contract for rate limiting and brute-force protection.
 * Independent of underlying storage (Redis, MongoDB TTL, or Memory).
 */
export interface IRateLimitStore {
  /**
   * Consume an attempt allowance against the specified key.
   *
   * @param key Unique identifier for the rate limit subject (e.g. `ip:127.0.0.1` or `email:user@domain.com`)
   * @param limit Maximum number of allowed attempts within the time window
   * @param windowMs Time window duration in milliseconds
   * @returns RateLimitResult containing whether allowed, remaining allowance, and retry delay
   */
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;

  /**
   * Reset or clear the rate limit counter for a key.
   */
  reset(key: string): Promise<void>;
}
