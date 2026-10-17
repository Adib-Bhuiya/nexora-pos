import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import User from '@/models/User';
import Session from '@/models/Session';
import RateLimit from '@/models/RateLimit';
import * as mongodb from '@/lib/mongodb';
import {
  MongoUserRepository,
  MongoSessionRepository,
  MongoRateLimitStore,
  createMongoAuthRepositories,
} from '@/lib/auth/mongo-repositories';
import {
  getAuthService,
  setAuthRepositories,
  getOrCreateMongoRepositories,
  AuthConfigurationError,
} from '@/lib/auth/container';
import { MemoryUserRepository } from '@/lib/auth/memory-repositories';

describe('MongoDB Authentication Repository Adapter (Stage 3)', () => {
  let connectDbSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Prevent real MongoDB connection calls in all unit tests
    connectDbSpy = vi.spyOn(mongodb, 'connectDB').mockResolvedValue(mongoose as unknown as typeof mongoose);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setAuthRepositories(null);
  });

  describe('MongoUserRepository', () => {
    let userRepo: MongoUserRepository;

    beforeEach(() => {
      userRepo = new MongoUserRepository();
    });

    it('creates owner and maps to UserRecord', async () => {
      const fakeMongoDoc = {
        _id: new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567890'),
        name: 'Store Owner',
        email: 'owner@store.com',
        passwordHash: '$2a$12$passwordhash',
        pinHash: '',
        role: 'owner',
        isOwner: true,
        initials: 'SO',
        active: true,
        failedPinAttempts: 0,
        pinLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(User, 'countDocuments').mockResolvedValue(0);
      vi.spyOn(User, 'create').mockImplementation(async () => fakeMongoDoc as never);

      const result = await userRepo.createOwner({
        name: 'Store Owner',
        email: 'owner@store.com',
        passwordHash: '$2a$12$passwordhash',
        initials: 'SO',
      });

      expect(connectDbSpy).toHaveBeenCalled();
      expect(result.id).toBe('60d5ecb8b5c9c61234567890');
      expect(result.name).toBe('Store Owner');
      expect(result.role).toBe('owner');
      expect(result.isOwner).toBe(true);
      expect(result.passwordHash).toBe('$2a$12$passwordhash');
    });

    it('translates duplicate key error code 11000 on isOwner to store owner registered error', async () => {
      vi.spyOn(User, 'countDocuments').mockResolvedValue(0);
      const duplicateError = new Error('E11000 duplicate key error collection: users index: isOwner_1');
      (duplicateError as unknown as { code: number }).code = 11000;
      vi.spyOn(User, 'create').mockRejectedValue(duplicateError);

      await expect(
        userRepo.createOwner({
          name: 'Imposter',
          email: 'imposter@store.com',
          passwordHash: 'hash',
          initials: 'IM',
        })
      ).rejects.toThrow('A store owner has already been registered.');
    });

    it('translates duplicate key error code 11000 on email to existing email error', async () => {
      vi.spyOn(User, 'countDocuments').mockResolvedValue(0);
      const duplicateError = new Error('E11000 duplicate key error collection: users index: email_1');
      (duplicateError as unknown as { code: number }).code = 11000;
      vi.spyOn(User, 'create').mockRejectedValue(duplicateError);

      await expect(
        userRepo.createOwner({
          name: 'Second Owner',
          email: 'duplicate@store.com',
          passwordHash: 'hash',
          initials: 'SO',
        })
      ).rejects.toThrow('A user with this email address already exists.');
    });

    it('uses atomic $inc for failed PIN increments and triggers lockout at threshold 5', async () => {
      const userId = '60d5ecb8b5c9c61234567890';
      const fakeUpdatedDoc = {
        _id: new mongoose.Types.ObjectId(userId),
        failedPinAttempts: 5,
        pinLockedUntil: null,
      };

      const findByIdAndUpdateSpy = vi.spyOn(User, 'findByIdAndUpdate');

      // Mock first call for $inc
      findByIdAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(fakeUpdatedDoc),
      } as unknown as ReturnType<typeof User.findByIdAndUpdate>);

      // Mock second call for $set pinLockedUntil
      findByIdAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({ ...fakeUpdatedDoc, pinLockedUntil: new Date(Date.now() + 900000) }),
      } as unknown as ReturnType<typeof User.findByIdAndUpdate>);

      const result = await userRepo.incrementFailedPinAttempts(userId, 5, 900000);

      // Verify atomic $inc operator was passed to MongoDB
      expect(findByIdAndUpdateSpy).toHaveBeenNthCalledWith(
        1,
        userId,
        { $inc: { failedPinAttempts: 1 } },
        { new: true }
      );

      expect(result.failedPinAttempts).toBe(5);
      expect(result.isLocked).toBe(true);
      expect(result.pinLockedUntil).not.toBeNull();
    });

    it('resets failed PIN attempts with atomic $set', async () => {
      const userId = '60d5ecb8b5c9c61234567890';
      const findByIdAndUpdateSpy = vi.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({} as unknown as ReturnType<typeof User.findByIdAndUpdate>);

      await userRepo.resetFailedPinAttempts(userId);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(userId, {
        $set: { failedPinAttempts: 0, pinLockedUntil: null },
      });
    });

    it('deletes cashier account and refuses to delete store owner', async () => {
      const ownerId = '60d5ecb8b5c9c61234567890';
      const cashierId = '60d5ecb8b5c9c61234567891';

      vi.spyOn(User, 'findById').mockImplementation((id: unknown) => {
        const isOwner = String(id) === ownerId;
        return {
          lean: vi.fn().mockResolvedValue({
            _id: id,
            role: isOwner ? 'owner' : 'cashier',
            isOwner,
          }),
        } as unknown as ReturnType<typeof User.findById>;
      });

      // Refuse owner deletion
      await expect(userRepo.deleteCashier(ownerId)).rejects.toThrow('Store owner accounts cannot be deleted.');

      // Permit cashier deletion
      const findByIdAndDeleteSpy = vi.spyOn(User, 'findByIdAndDelete').mockResolvedValue({} as unknown as ReturnType<typeof User.findByIdAndDelete>);
      const deleted = await userRepo.deleteCashier(cashierId);
      expect(deleted).toBe(true);
      expect(findByIdAndDeleteSpy).toHaveBeenCalledWith(cashierId);
    });
  });

  describe('MongoSessionRepository', () => {
    let sessionRepo: MongoSessionRepository;

    beforeEach(() => {
      sessionRepo = new MongoSessionRepository();
    });

    it('creates a session with tokenHash and userId ObjectId', async () => {
      const fakeSessionDoc = {
        _id: new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567892'),
        tokenHash: 'hashedtokenvalue64chars',
        userId: new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567890'),
        role: 'cashier',
        name: 'Cashier Alice',
        userAgent: 'POS/1.0',
        ipAddress: '127.0.0.1',
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createSpy = vi.spyOn(Session, 'create').mockImplementation(async () => fakeSessionDoc as never);

      const record = await sessionRepo.createSession({
        tokenHash: 'hashedtokenvalue64chars',
        userId: '60d5ecb8b5c9c61234567890',
        role: 'cashier',
        name: 'Cashier Alice',
        expiresAt: new Date(Date.now() + 3600000),
      });

      expect(createSpy).toHaveBeenCalled();
      expect(record.tokenHash).toBe('hashedtokenvalue64chars');
      expect(record.userId).toBe('60d5ecb8b5c9c61234567890');
      expect(record.role).toBe('cashier');
    });

    it('queries active session with expiresAt in the future', async () => {
      const findOneSpy = vi.spyOn(Session, 'findOne').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          tokenHash: 'validtokenhash',
          userId: new mongoose.Types.ObjectId(),
          role: 'owner',
          name: 'Owner',
          expiresAt: new Date(Date.now() + 60000),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as unknown as ReturnType<typeof Session.findOne>);

      const session = await sessionRepo.findActiveSessionByTokenHash('validtokenhash');
      expect(session).not.toBeNull();
      expect(findOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: 'validtokenhash',
          expiresAt: expect.any(Object),
        })
      );
    });

    it('revokes all sessions for a specific user across devices', async () => {
      const userId = '60d5ecb8b5c9c61234567890';
      const deleteManySpy = vi.spyOn(Session, 'deleteMany').mockResolvedValue({
        deletedCount: 3,
        acknowledged: true,
      });

      const count = await sessionRepo.revokeAllUserSessions(userId);
      expect(count).toBe(3);
      expect(deleteManySpy).toHaveBeenCalledWith({
        userId: new mongoose.Types.ObjectId(userId),
      });
    });
  });

  describe('MongoRateLimitStore', () => {
    let rateLimitStore: MongoRateLimitStore;

    beforeEach(() => {
      rateLimitStore = new MongoRateLimitStore();
    });

    it('atomically increments active rate limit window when present', async () => {
      const findOneAndUpdateSpy = vi.spyOn(RateLimit, 'findOneAndUpdate');

      findOneAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          key: 'login:127.0.0.1',
          count: 2,
          expiresAt: new Date(Date.now() + 60000),
        }),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      const result = await rateLimitStore.consume('login:127.0.0.1', 5, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'login:127.0.0.1', expiresAt: expect.any(Object) }),
        { $inc: { count: 1 } },
        { new: true }
      );
    });

    it('resets expired window atomically using conditional update on expired records', async () => {
      const findOneAndUpdateSpy = vi.spyOn(RateLimit, 'findOneAndUpdate');

      // 1. Increment active check returns null (record is expired)
      findOneAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(null),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      // 2. Conditional expired reset succeeds
      findOneAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          key: 'login:127.0.0.1',
          count: 1,
          expiresAt: new Date(Date.now() + 60000),
        }),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      const result = await rateLimitStore.consume('login:127.0.0.1', 5, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(findOneAndUpdateSpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          key: 'login:127.0.0.1',
          expiresAt: expect.objectContaining({ $lte: expect.any(Date) }),
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ count: 1, expiresAt: expect.any(Date) }),
        }),
        { new: true }
      );
    });

    it('handles two concurrent requests against an expired existing record without overwriting quota', async () => {
      const findOneAndUpdateSpy = vi.spyOn(RateLimit, 'findOneAndUpdate');
      const createSpy = vi.spyOn(RateLimit, 'create');

      // Model an expired document in the database
      let dbDoc: { key: string; count: number; expiresAt: Date } | null = {
        key: 'login:127.0.0.1',
        count: 5,
        expiresAt: new Date(Date.now() - 5000), // expired in past
      };

      findOneAndUpdateSpy.mockImplementation((filter: unknown, update: unknown) => {
        const f = filter as { key: string; expiresAt?: { $gt?: Date; $lte?: Date } };
        const u = update as { $inc?: { count?: number }; $set?: { count?: number; expiresAt?: Date } };

        if (!dbDoc || dbDoc.key !== f.key) {
          return { lean: vi.fn().mockResolvedValue(null) } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>;
        }

        const matchesGt = !f.expiresAt?.$gt || dbDoc.expiresAt.getTime() > f.expiresAt.$gt.getTime();
        const matchesLte = !f.expiresAt?.$lte || dbDoc.expiresAt.getTime() <= f.expiresAt.$lte.getTime();

        if (matchesGt && matchesLte) {
          if (u.$inc?.count) dbDoc.count += u.$inc.count;
          if (u.$set?.count !== undefined) dbDoc.count = u.$set.count;
          if (u.$set?.expiresAt) dbDoc.expiresAt = u.$set.expiresAt;
          return {
            lean: vi.fn().mockResolvedValue({ ...dbDoc }),
          } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>;
        }

        return { lean: vi.fn().mockResolvedValue(null) } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>;
      });

      createSpy.mockImplementation((data: unknown) => {
        if (dbDoc) {
          const err = new Error('E11000 duplicate key error');
          (err as unknown as { code: number }).code = 11000;
          return Promise.reject(err);
        }
        const d = data as { key: string; count: number; expiresAt: Date };
        dbDoc = { key: d.key, count: d.count, expiresAt: d.expiresAt };
        return Promise.resolve({ ...dbDoc }) as never;
      });

      const [res1, res2] = await Promise.all([
        rateLimitStore.consume('login:127.0.0.1', 5, 60000),
        rateLimitStore.consume('login:127.0.0.1', 5, 60000),
      ]);

      const counts = [res1.remaining, res2.remaining].sort();
      // One request gets remaining: 4 (count 1), the concurrent request gets remaining: 3 (count 2)
      expect(counts).toEqual([3, 4]);
      expect(res1.allowed).toBe(true);
      expect(res2.allowed).toBe(true);
      expect(dbDoc!.count).toBe(2);
    });

    it('handles two concurrent requests when no record exists initially without losing increments', async () => {
      const findOneAndUpdateSpy = vi.spyOn(RateLimit, 'findOneAndUpdate');
      const createSpy = vi.spyOn(RateLimit, 'create');

      // Model no initial document in database
      let dbDoc: { key: string; count: number; expiresAt: Date } | null = null;

      findOneAndUpdateSpy.mockImplementation((filter: unknown, update: unknown) => {
        const f = filter as { key: string; expiresAt?: { $gt?: Date; $lte?: Date } };
        const u = update as { $inc?: { count?: number }; $set?: { count?: number; expiresAt?: Date } };

        if (!dbDoc || dbDoc.key !== f.key) {
          return { lean: vi.fn().mockResolvedValue(null) } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>;
        }

        const matchesGt = !f.expiresAt?.$gt || dbDoc.expiresAt.getTime() > f.expiresAt.$gt.getTime();
        const matchesLte = !f.expiresAt?.$lte || dbDoc.expiresAt.getTime() <= f.expiresAt.$lte.getTime();

        if (matchesGt && matchesLte) {
          if (u.$inc?.count) dbDoc.count += u.$inc.count;
          if (u.$set?.count !== undefined) dbDoc.count = u.$set.count;
          if (u.$set?.expiresAt) dbDoc.expiresAt = u.$set.expiresAt;
          return {
            lean: vi.fn().mockResolvedValue({ ...dbDoc }),
          } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>;
        }

        return { lean: vi.fn().mockResolvedValue(null) } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>;
      });

      createSpy.mockImplementation((data: unknown) => {
        if (dbDoc) {
          const err = new Error('E11000 duplicate key error');
          (err as unknown as { code: number }).code = 11000;
          return Promise.reject(err);
        }
        const d = data as { key: string; count: number; expiresAt: Date };
        dbDoc = { key: d.key, count: d.count, expiresAt: d.expiresAt };
        return Promise.resolve({ ...dbDoc }) as never;
      });

      const [res1, res2] = await Promise.all([
        rateLimitStore.consume('login:127.0.0.1', 5, 60000),
        rateLimitStore.consume('login:127.0.0.1', 5, 60000),
      ]);

      const counts = [res1.remaining, res2.remaining].sort();
      expect(counts).toEqual([3, 4]);
      expect(res1.allowed).toBe(true);
      expect(res2.allowed).toBe(true);
      expect(dbDoc!.count).toBe(2);
    });

    it('recovers from duplicate-key creation race with bounded retry on active window', async () => {
      const findOneAndUpdateSpy = vi.spyOn(RateLimit, 'findOneAndUpdate');
      const createSpy = vi.spyOn(RateLimit, 'create');

      // 1. Initial active check returns null
      findOneAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(null),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      // 2. Expired reset returns null
      findOneAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(null),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      // 3. Create encounters collision with racing request
      const collisionErr = new Error('E11000 duplicate key error');
      (collisionErr as unknown as { code: number }).code = 11000;
      createSpy.mockRejectedValueOnce(collisionErr);

      // 4. Retry incrementing active window succeeds
      findOneAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({
          key: 'login:127.0.0.1',
          count: 2,
          expiresAt: new Date(Date.now() + 60000),
        }),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      const result = await rateLimitStore.consume('login:127.0.0.1', 5, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
    });

    it('fails closed when active increment retry cannot obtain record', async () => {
      const findOneAndUpdateSpy = vi.spyOn(RateLimit, 'findOneAndUpdate');
      const createSpy = vi.spyOn(RateLimit, 'create');

      // 1. Initial active check returns null
      findOneAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(null),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      // 2. Expired reset returns null
      findOneAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(null),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      // 3. Create encounters collision
      const collisionErr = new Error('E11000 duplicate key error');
      (collisionErr as unknown as { code: number }).code = 11000;
      createSpy.mockRejectedValueOnce(collisionErr);

      // 4. Retry increment fails to obtain record (returns null)
      findOneAndUpdateSpy.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(null),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      await expect(rateLimitStore.consume('login:127.0.0.1', 5, 60000)).rejects.toThrow(
        'Rate limit check failed to obtain quota record.'
      );
    });

    it('blocks request when quota limit is exceeded', async () => {
      vi.spyOn(RateLimit, 'findOneAndUpdate').mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          key: 'login:127.0.0.1',
          count: 6, // Exceeds limit of 5
          expiresAt: new Date(Date.now() + 30000),
        }),
      } as unknown as ReturnType<typeof RateLimit.findOneAndUpdate>);

      const result = await rateLimitStore.consume('login:127.0.0.1', 5, 60000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfterSec).toBeDefined();
      expect(result.retryAfterSec).toBeGreaterThan(0);
    });
  });

  describe('Container & Production Repository Selection', () => {
    it('lazily resolves MongoDB repositories in production factory without memory fallback', () => {
      const repos = createMongoAuthRepositories();
      expect(repos.userRepository).toBeInstanceOf(MongoUserRepository);
      expect(repos.sessionRepository).toBeInstanceOf(MongoSessionRepository);
      expect(repos.rateLimitStore).toBeInstanceOf(MongoRateLimitStore);

      const resolved = getOrCreateMongoRepositories();
      expect(resolved.userRepo).toBeInstanceOf(MongoUserRepository);
      expect(resolved.sessionRepo).toBeInstanceOf(MongoSessionRepository);
      expect(resolved.rateLimitStore).toBeInstanceOf(MongoRateLimitStore);
    });

    it('fails closed in test environment when repositories are not explicitly configured', () => {
      setAuthRepositories(null);
      expect(() => getAuthService()).toThrow(AuthConfigurationError);
    });

    it('respects explicit in-memory repository injection for unit tests', () => {
      setAuthRepositories({
        userRepo: new MemoryUserRepository(),
        sessionRepo: {} as unknown as ReturnType<typeof createMongoAuthRepositories>['sessionRepository'],
        rateLimitStore: {} as unknown as ReturnType<typeof createMongoAuthRepositories>['rateLimitStore'],
      });

      const service = getAuthService();
      expect(service).toBeDefined();
    });
  });
});
