import crypto from 'crypto';
import type {
  CreateCashierInput,
  CreateOwnerInput,
  CreatePasswordResetTokenInput,
  CreateSessionInput,
  PasswordResetTokenRecord,
  PinAttemptResult,
  RateLimitResult,
  SafeUser,
  SessionRecord,
  UpdateUserInput,
  UserAuthStatus,
  UserRecord,
} from './types';
import type {
  IPasswordResetTokenRepository,
  IRateLimitStore,
  ISessionRepository,
  IUserRepository,
} from './repositories';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj), (_key, value) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return new Date(value);
    }
    return value;
  }) as T;
}

export function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isOwner: user.isOwner,
    initials: user.initials,
    active: user.active,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

/**
 * In-memory implementation of IUserRepository.
 * Completely self-contained for isolated automated testing and development.
 */
export class MemoryUserRepository implements IUserRepository {
  private users: Map<string, UserRecord> = new Map();

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;

    for (const user of this.users.values()) {
      if (user.email.trim().toLowerCase() === normalized) {
        return clone(user);
      }
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? clone(user) : null;
  }

  async listCashiers(): Promise<SafeUser[]> {
    const cashiers: SafeUser[] = [];
    for (const user of this.users.values()) {
      if (user.role === 'cashier') {
        cashiers.push(toSafeUser(user));
      }
    }
    return cashiers;
  }

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async countOwners(): Promise<number> {
    let count = 0;
    for (const user of this.users.values()) {
      if (user.isOwner || user.role === 'owner') {
        count++;
      }
    }
    return count;
  }

  async createOwner(data: CreateOwnerInput): Promise<UserRecord> {
    const ownerCount = await this.countOwners();
    if (ownerCount > 0) {
      throw new Error('A store owner has already been registered.');
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    if (await this.findByEmail(normalizedEmail)) {
      throw new Error('A user with this email address already exists.');
    }

    const now = new Date();
    const id = `user_${crypto.randomBytes(12).toString('hex')}`;

    const record: UserRecord = {
      id,
      name: data.name.trim(),
      email: normalizedEmail,
      passwordHash: data.passwordHash,
      pinHash: '',
      role: 'owner',
      isOwner: true,
      initials: data.initials.trim().toUpperCase(),
      active: true,
      failedPinAttempts: 0,
      pinLockedUntil: null,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(id, record);
    return clone(record);
  }

  async createCashier(data: CreateCashierInput): Promise<UserRecord> {
    const now = new Date();
    const id = `user_${crypto.randomBytes(12).toString('hex')}`;

    const record: UserRecord = {
      id,
      name: data.name.trim(),
      email: '',
      passwordHash: '',
      pinHash: data.pinHash,
      role: 'cashier',
      isOwner: false,
      initials: data.initials.trim().toUpperCase(),
      active: data.active ?? true,
      failedPinAttempts: 0,
      pinLockedUntil: null,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(id, record);
    return clone(record);
  }

  async updateUser(id: string, updates: UpdateUserInput): Promise<UserRecord | null> {
    const user = this.users.get(id);
    if (!user) return null;

    if (updates.email !== undefined) {
      const normalized = updates.email.trim().toLowerCase();
      if (normalized && normalized !== user.email) {
        const existing = await this.findByEmail(normalized);
        if (existing && existing.id !== id) {
          throw new Error('A user with this email address already exists.');
        }
      }
      user.email = normalized;
    }

    if (updates.name !== undefined) user.name = updates.name.trim();
    if (updates.initials !== undefined) user.initials = updates.initials.trim().toUpperCase();
    if (updates.active !== undefined) user.active = updates.active;
    if (updates.passwordHash !== undefined) user.passwordHash = updates.passwordHash;
    if (updates.pinHash !== undefined) user.pinHash = updates.pinHash;

    user.updatedAt = new Date();
    return clone(user);
  }

  async deleteCashier(id: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) return false;

    if (user.isOwner || user.role === 'owner') {
      throw new Error('Store owner accounts cannot be deleted.');
    }

    return this.users.delete(id);
  }

  async incrementFailedPinAttempts(
    id: string,
    maxAttempts: number = 5,
    lockDurationMs: number = 15 * 60 * 1000
  ): Promise<PinAttemptResult> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with ID ${id} not found.`);
    }

    user.failedPinAttempts += 1;
    const now = Date.now();
    let isLocked = false;

    if (user.failedPinAttempts >= maxAttempts) {
      user.pinLockedUntil = new Date(now + lockDurationMs);
      isLocked = true;
    } else if (user.pinLockedUntil && user.pinLockedUntil.getTime() > now) {
      isLocked = true;
    }

    user.updatedAt = new Date();
    return {
      failedPinAttempts: user.failedPinAttempts,
      isLocked,
      pinLockedUntil: user.pinLockedUntil ? new Date(user.pinLockedUntil) : null,
    };
  }

  async resetFailedPinAttempts(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.failedPinAttempts = 0;
      user.pinLockedUntil = null;
      user.updatedAt = new Date();
    }
  }

  async lockPinAccount(id: string, until: Date): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.pinLockedUntil = new Date(until);
      user.updatedAt = new Date();
    }
  }

  async getAuthStatus(id: string): Promise<UserAuthStatus> {
    const user = this.users.get(id);
    if (!user) {
      return {
        exists: false,
        active: false,
        isLocked: false,
        pinLockedUntil: null,
        failedPinAttempts: 0,
      };
    }

    const now = Date.now();
    const isLocked = Boolean(user.pinLockedUntil && user.pinLockedUntil.getTime() > now);

    return {
      exists: true,
      active: user.active,
      isLocked,
      pinLockedUntil: user.pinLockedUntil ? new Date(user.pinLockedUntil) : null,
      failedPinAttempts: user.failedPinAttempts,
    };
  }

  /**
   * Test utility to reset in-memory state.
   */
  clear(): void {
    this.users.clear();
  }
}

/**
 * In-memory implementation of ISessionRepository.
 * Completely self-contained for isolated automated testing and development.
 */
export class MemorySessionRepository implements ISessionRepository {
  private sessions: Map<string, SessionRecord> = new Map();

  async createSession(data: CreateSessionInput): Promise<SessionRecord> {
    const now = new Date();
    const id = `sess_${crypto.randomBytes(12).toString('hex')}`;

    const record: SessionRecord = {
      id,
      tokenHash: data.tokenHash,
      userId: data.userId,
      role: data.role,
      name: data.name,
      userAgent: data.userAgent || '',
      ipAddress: data.ipAddress || '',
      expiresAt: new Date(data.expiresAt),
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(data.tokenHash, record);
    return clone(record);
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;

    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(tokenHash);
      return null;
    }

    return clone(session);
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<boolean> {
    return this.sessions.delete(tokenHash);
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    let count = 0;
    for (const [tokenHash, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(tokenHash);
        count++;
      }
    }
    return count;
  }

  async purgeExpiredSessions(): Promise<number> {
    const now = Date.now();
    let purged = 0;
    for (const [tokenHash, session] of this.sessions.entries()) {
      if (session.expiresAt.getTime() <= now) {
        this.sessions.delete(tokenHash);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Test utility to reset in-memory state.
   */
  clear(): void {
    this.sessions.clear();
  }
}

/**
 * In-memory implementation of IRateLimitStore.
 */
export class MemoryRateLimitStore implements IRateLimitStore {
  private limits: Map<string, { count: number; expiresAt: number }> = new Map();

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || entry.expiresAt <= now) {
      const expiresAt = now + windowMs;
      this.limits.set(key, { count: 1, expiresAt });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        resetAt: new Date(expiresAt),
      };
    }

    entry.count += 1;
    const retryAfterSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    const resetAt = new Date(entry.expiresAt);

    if (entry.count > limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec,
        resetAt,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - entry.count),
      resetAt,
    };
  }

  async reset(key: string): Promise<void> {
    this.limits.delete(key);
  }

  /**
   * Test utility to reset in-memory state.
   */
  clear(): void {
    this.limits.clear();
  }
}

/**
 * In-memory password reset token repository for unit tests.
 */
export class MemoryPasswordResetTokenRepository implements IPasswordResetTokenRepository {
  private tokens = new Map<string, PasswordResetTokenRecord>();

  async createToken(data: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRecord> {
    const record: PasswordResetTokenRecord = {
      id: `reset_${crypto.randomUUID()}`,
      userId: data.userId,
      email: data.email.trim().toLowerCase(),
      tokenHash: data.tokenHash,
      expiresAt: new Date(data.expiresAt),
      consumedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tokens.set(data.tokenHash, record);
    return clone(record);
  }

  async consumeToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const token = this.tokens.get(tokenHash);
    if (!token) return null;
    if (token.consumedAt !== null) return null;
    if (token.expiresAt.getTime() <= Date.now()) return null;

    token.consumedAt = new Date();
    token.updatedAt = new Date();
    return clone(token);
  }

  async invalidateTokensForUser(userId: string): Promise<number> {
    let count = 0;
    const now = new Date();
    for (const token of this.tokens.values()) {
      if (token.userId === userId && token.consumedAt === null) {
        token.consumedAt = now;
        token.updatedAt = now;
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.tokens.clear();
  }
}

/**
 * Factory to instantiate a fresh set of in-memory auth repositories.
 */
export function createMemoryAuthRepositories(): {
  userRepository: MemoryUserRepository;
  sessionRepository: MemorySessionRepository;
  rateLimitStore: MemoryRateLimitStore;
  passwordResetTokenRepository: MemoryPasswordResetTokenRepository;
} {
  return {
    userRepository: new MemoryUserRepository(),
    sessionRepository: new MemorySessionRepository(),
    rateLimitStore: new MemoryRateLimitStore(),
    passwordResetTokenRepository: new MemoryPasswordResetTokenRepository(),
  };
}
