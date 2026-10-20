import mongoose from 'mongoose';
import User from '@/models/User';
import Session from '@/models/Session';
import RateLimit from '@/models/RateLimit';
import { connectDB } from '@/lib/mongodb';
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
  UserRole,
} from './types';
import type {
  IUserRepository,
  ISessionRepository,
  IRateLimitStore,
} from './repositories';

class RepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryConflictError';
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    if ('code' in err && (err as { code: unknown }).code === 11000) return true;
    if (
      'name' in err &&
      (err as { name: unknown }).name === 'MongoServerError' &&
      String(err).includes('E11000')
    ) {
      return true;
    }
    const msg = String(err);
    if (msg.includes('E11000') || msg.includes('duplicate key')) return true;
  }
  return false;
}

interface MongoUserDoc {
  _id: mongoose.Types.ObjectId | string;
  name: string;
  email?: string;
  passwordHash?: string;
  pinHash?: string;
  role: string;
  isOwner?: boolean;
  initials: string;
  active?: boolean;
  failedPinAttempts?: number;
  pinLockedUntil?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function toUserRecord(doc: MongoUserDoc): UserRecord {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email || '',
    passwordHash: doc.passwordHash || '',
    pinHash: doc.pinHash || '',
    role: (doc.role as UserRole) || 'cashier',
    isOwner: Boolean(doc.isOwner),
    initials: doc.initials,
    active: doc.active !== false,
    failedPinAttempts: doc.failedPinAttempts ?? 0,
    pinLockedUntil: doc.pinLockedUntil ? new Date(doc.pinLockedUntil) : null,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
  };
}

interface MongoSessionDoc {
  _id: mongoose.Types.ObjectId | string;
  tokenHash: string;
  userId: mongoose.Types.ObjectId | string;
  role: string;
  name: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function toSessionRecord(doc: MongoSessionDoc): SessionRecord {
  return {
    id: doc._id.toString(),
    tokenHash: doc.tokenHash,
    userId: doc.userId.toString(),
    role: (doc.role as UserRole) || 'cashier',
    name: doc.name,
    userAgent: doc.userAgent || '',
    ipAddress: doc.ipAddress || '',
    expiresAt: new Date(doc.expiresAt),
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
  };
}

/**
 * MongoDB-backed implementation of IUserRepository.
 * Relies on atomic database updates and partial unique indexes for concurrency safety.
 */
export class MongoUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;

    await connectDB();
    const doc = (await User.findOne({ email: normalized }).lean()) as MongoUserDoc | null;
    return doc ? toUserRecord(doc) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    if (!mongoose.isValidObjectId(id)) return null;

    await connectDB();
    const doc = (await User.findById(id).lean()) as MongoUserDoc | null;
    return doc ? toUserRecord(doc) : null;
  }

  async listCashiers(): Promise<SafeUser[]> {
    await connectDB();
    const docs = (await User.find({ role: 'cashier' })
      .sort({ createdAt: 1 })
      .lean()) as MongoUserDoc[];

    return docs.map((doc) => ({
      id: doc._id.toString(),
      name: doc.name,
      email: doc.email || '',
      role: 'cashier',
      isOwner: false,
      initials: doc.initials,
      active: doc.active !== false,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    }));
  }

  async countUsers(): Promise<number> {
    await connectDB();
    return User.countDocuments();
  }

  async countOwners(): Promise<number> {
    await connectDB();
    return User.countDocuments({ $or: [{ isOwner: true }, { role: 'owner' }] });
  }

  async createOwner(data: CreateOwnerInput): Promise<UserRecord> {
    await connectDB();

    const normalizedEmail = data.email.trim().toLowerCase();

    // Application-level early check
    const ownerCount = await this.countOwners();
    if (ownerCount > 0) {
      throw new Error('A store owner has already been registered.');
    }

    try {
      const doc = (await User.create({
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
      })) as MongoUserDoc;

      return toUserRecord(doc);
    } catch (err: unknown) {
  if (isDuplicateKeyError(err)) {
    const msg = String(err).toLowerCase();

    if (msg.includes('email')) {
      throw new RepositoryConflictError(
        'A user with this email address already exists.'
      );
    }

    throw new RepositoryConflictError(
      'A store owner has already been registered.'
    );
  }

  throw err;
}
  }

  async createCashier(data: CreateCashierInput): Promise<UserRecord> {
    await connectDB();

    const doc = (await User.create({
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
    })) as MongoUserDoc;

    return toUserRecord(doc);
  }

  async updateUser(id: string, updates: UpdateUserInput): Promise<UserRecord | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    await connectDB();

    const setFields: Record<string, unknown> = {};
    if (updates.name !== undefined) setFields.name = updates.name.trim();
    if (updates.email !== undefined) setFields.email = updates.email.trim().toLowerCase();
    if (updates.initials !== undefined) setFields.initials = updates.initials.trim().toUpperCase();
    if (updates.active !== undefined) setFields.active = updates.active;
    if (updates.passwordHash !== undefined) setFields.passwordHash = updates.passwordHash;
    if (updates.pinHash !== undefined) setFields.pinHash = updates.pinHash;

    try {
      const doc = (await User.findByIdAndUpdate(
        id,
        { $set: setFields },
        { new: true, runValidators: true }
      ).lean()) as MongoUserDoc | null;

      return doc ? toUserRecord(doc) : null;
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        throw new Error('A user with this email address already exists.');
      }
      throw err;
    }
  }

  async deleteCashier(id: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) return false;
    await connectDB();

    const target = (await User.findById(id).lean()) as MongoUserDoc | null;
    if (!target) return false;

    if (target.isOwner || target.role === 'owner') {
      throw new Error('Store owner accounts cannot be deleted.');
    }

    const result = await User.findByIdAndDelete(id);
    return Boolean(result);
  }

  /**
   * Atomically increments failed PIN attempts and updates lockout state.
   */
  async incrementFailedPinAttempts(
    id: string,
    maxAttempts: number = 5,
    lockDurationMs: number = 15 * 60 * 1000
  ): Promise<PinAttemptResult> {
    if (!mongoose.isValidObjectId(id)) {
      throw new Error(`User with ID ${id} not found.`);
    }

    await connectDB();

    // 1. Atomic increment of counter
    const updated = (await User.findByIdAndUpdate(
      id,
      { $inc: { failedPinAttempts: 1 } },
      { new: true }
    ).lean()) as MongoUserDoc | null;

    if (!updated) {
      throw new Error(`User with ID ${id} not found.`);
    }

    const now = Date.now();
    let isLocked = false;
    let pinLockedUntil: Date | null = updated.pinLockedUntil
      ? new Date(updated.pinLockedUntil)
      : null;

    if ((updated.failedPinAttempts ?? 0) >= maxAttempts) {
      // If reached threshold, atomically set pinLockedUntil if not currently active
      if (!pinLockedUntil || pinLockedUntil.getTime() <= now) {
        const lockUntil = new Date(now + lockDurationMs);
        await User.findByIdAndUpdate(
          id,
          { $set: { pinLockedUntil: lockUntil } },
          { new: true }
        );
        pinLockedUntil = lockUntil;
      }
      isLocked = true;
    } else if (pinLockedUntil && pinLockedUntil.getTime() > now) {
      isLocked = true;
    }

    return {
      failedPinAttempts: updated.failedPinAttempts ?? 1,
      isLocked,
      pinLockedUntil,
    };
  }

  async resetFailedPinAttempts(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await connectDB();

    await User.findByIdAndUpdate(id, {
      $set: { failedPinAttempts: 0, pinLockedUntil: null },
    });
  }

  async lockPinAccount(id: string, until: Date): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await connectDB();

    await User.findByIdAndUpdate(id, {
      $set: { pinLockedUntil: new Date(until) },
    });
  }

  async getAuthStatus(id: string): Promise<UserAuthStatus> {
    if (!mongoose.isValidObjectId(id)) {
      return {
        exists: false,
        active: false,
        isLocked: false,
        pinLockedUntil: null,
        failedPinAttempts: 0,
      };
    }

    await connectDB();
    const doc = (await User.findById(id).lean()) as MongoUserDoc | null;
    if (!doc) {
      return {
        exists: false,
        active: false,
        isLocked: false,
        pinLockedUntil: null,
        failedPinAttempts: 0,
      };
    }

    const now = Date.now();
    const isLocked = Boolean(
      doc.pinLockedUntil && new Date(doc.pinLockedUntil).getTime() > now
    );

    return {
      exists: true,
      active: doc.active !== false,
      isLocked,
      pinLockedUntil: doc.pinLockedUntil ? new Date(doc.pinLockedUntil) : null,
      failedPinAttempts: doc.failedPinAttempts ?? 0,
    };
  }
}

/**
 * MongoDB-backed implementation of ISessionRepository.
 * Manages active sessions and respects both TTL indices and explicit timestamp validity.
 */
export class MongoSessionRepository implements ISessionRepository {
  async createSession(data: CreateSessionInput): Promise<SessionRecord> {
    await connectDB();

    const doc = (await Session.create({
      tokenHash: data.tokenHash,
      userId: new mongoose.Types.ObjectId(data.userId),
      role: data.role,
      name: data.name,
      userAgent: data.userAgent || '',
      ipAddress: data.ipAddress || '',
      expiresAt: new Date(data.expiresAt),
    })) as MongoSessionDoc;

    return toSessionRecord(doc);
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    await connectDB();

    // Query active session where expiresAt is strictly in the future
    const doc = (await Session.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    }).lean()) as MongoSessionDoc | null;

    return doc ? toSessionRecord(doc) : null;
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<boolean> {
    await connectDB();
    const res = await Session.deleteOne({ tokenHash });
    return (res.deletedCount ?? 0) > 0;
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    if (!mongoose.isValidObjectId(userId)) return 0;
    await connectDB();

    const res = await Session.deleteMany({
      userId: new mongoose.Types.ObjectId(userId),
    });
    return res.deletedCount ?? 0;
  }

  async purgeExpiredSessions(): Promise<number> {
    await connectDB();
    const res = await Session.deleteMany({
      expiresAt: { $lte: new Date() },
    });
    return res.deletedCount ?? 0;
  }
}

interface MongoRateLimitDoc {
  key: string;
  count: number;
  expiresAt: Date | string;
}

/**
 * MongoDB-backed implementation of IRateLimitStore.
 * Enforces atomic sliding-window rate limits using findOneAndUpdate upserts.
 */
export class MongoRateLimitStore implements IRateLimitStore {
  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    await connectDB();

    const now = new Date();
    const nowMs = now.getTime();
    const windowExpiry = new Date(nowMs + windowMs);

    // 1. Atomically increment existing non-expired window
    let doc = (await RateLimit.findOneAndUpdate(
      { key, expiresAt: { $gt: now } },
      { $inc: { count: 1 } },
      { new: true }
    ).lean()) as MongoRateLimitDoc | null;

    if (!doc) {
      // 2. Window expired: atomically reset if an expired record is present.
      // Conditional filter { expiresAt: { $lte: now } } guarantees that exactly
      // one concurrent request resets the window without racing requests overwriting it.
      doc = (await RateLimit.findOneAndUpdate(
        { key, expiresAt: { $lte: now } },
        { $set: { count: 1, expiresAt: windowExpiry } },
        { new: true }
      ).lean()) as MongoRateLimitDoc | null;
    }

    if (!doc) {
      // 3. No document exists (or another racing request already created/reset it).
      // Attempt creation for new key.
      try {
        const created = (await RateLimit.create({
          key,
          count: 1,
          expiresAt: windowExpiry,
        })) as unknown as MongoRateLimitDoc;

        doc = {
          key: created.key,
          count: created.count,
          expiresAt: created.expiresAt,
        };
      } catch (err: unknown) {
        if (isDuplicateKeyError(err)) {
          // Concurrent creation or rollover race: retry incrementing the active window once
          doc = (await RateLimit.findOneAndUpdate(
            { key, expiresAt: { $gt: now } },
            { $inc: { count: 1 } },
            { new: true }
          ).lean()) as MongoRateLimitDoc | null;
        } else {
          throw err;
        }
      }
    }

    if (!doc) {
      throw new Error('Rate limit check failed to obtain quota record.');
    }

    const expiresAtMs = new Date(doc.expiresAt).getTime();
    const retryAfterSec = Math.max(1, Math.ceil((expiresAtMs - nowMs) / 1000));
    const resetAt = new Date(doc.expiresAt);

    if (doc.count > limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec,
        resetAt,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - doc.count),
      resetAt,
    };
  }

  async reset(key: string): Promise<void> {
    await connectDB();
    await RateLimit.deleteOne({ key });
  }
}

/**
 * Instantiates the production MongoDB repository instances.
 */
export function createMongoAuthRepositories(): {
  userRepository: MongoUserRepository;
  sessionRepository: MongoSessionRepository;
  rateLimitStore: MongoRateLimitStore;
} {
  return {
    userRepository: new MongoUserRepository(),
    sessionRepository: new MongoSessionRepository(),
    rateLimitStore: new MongoRateLimitStore(),
  };
}
