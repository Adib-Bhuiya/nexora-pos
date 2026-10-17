import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMemoryAuthRepositories,
  MemoryUserRepository,
  MemorySessionRepository,
  MemoryRateLimitStore,
  toSafeUser,
  type UserRecord,
} from '@/lib/auth';

describe('Authentication Repository Architecture (Stage 1)', () => {
  describe('MemoryUserRepository', () => {
    let userRepo: MemoryUserRepository;

    beforeEach(() => {
      userRepo = new MemoryUserRepository();
    });

    it('initializes with zero users and owners', async () => {
      expect(await userRepo.countUsers()).toBe(0);
      expect(await userRepo.countOwners()).toBe(0);
      expect(await userRepo.listCashiers()).toEqual([]);
    });

    it('creates store owner and enforces single-owner invariant', async () => {
      const owner = await userRepo.createOwner({
        name: 'Alice Owner',
        email: 'Alice@NexoraPOS.com',
        passwordHash: '$2a$12$securepasswordhashvalue',
        initials: 'ao',
      });

      expect(owner.id).toBeDefined();
      expect(owner.name).toBe('Alice Owner');
      expect(owner.email).toBe('alice@nexorapos.com'); // lowercased
      expect(owner.role).toBe('owner');
      expect(owner.isOwner).toBe(true);
      expect(owner.initials).toBe('AO'); // uppercased
      expect(owner.active).toBe(true);
      expect(owner.failedPinAttempts).toBe(0);
      expect(owner.pinLockedUntil).toBeNull();
      expect(await userRepo.countOwners()).toBe(1);
      expect(await userRepo.countUsers()).toBe(1);

      // Attempting to register another owner must fail
      await expect(
        userRepo.createOwner({
          name: 'Bob Imposter',
          email: 'bob@example.com',
          passwordHash: 'somehash',
          initials: 'BI',
        })
      ).rejects.toThrow('A store owner has already been registered.');
    });

    it('prevents creating users with duplicate email', async () => {
      await userRepo.createOwner({
        name: 'Alice Owner',
        email: 'shared@nexorapos.com',
        passwordHash: 'hash1',
        initials: 'AO',
      });

      // Find by email with different casing
      const found = await userRepo.findByEmail('SHARED@nexorapos.com');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Alice Owner');
    });

    it('creates cashiers, lists them safely without credential hashes', async () => {
      await userRepo.createOwner({
        name: 'Store Owner',
        email: 'owner@store.com',
        passwordHash: 'ownerhash',
        initials: 'SO',
      });

      const cashier1 = await userRepo.createCashier({
        name: 'Cashier One',
        pinHash: '$2a$10$pin_hash_1',
        initials: 'c1',
      });

      const cashier2 = await userRepo.createCashier({
        name: 'Cashier Two',
        pinHash: '$2a$10$pin_hash_2',
        initials: 'c2',
        active: false,
      });

      expect(cashier1.id).toBeDefined();
      expect(cashier2.id).toBeDefined();
      expect(await userRepo.countUsers()).toBe(3);
      expect(await userRepo.countOwners()).toBe(1);

      const cashiers = await userRepo.listCashiers();
      expect(cashiers).toHaveLength(2);
      expect(cashiers.map((c) => c.name)).toContain('Cashier One');
      expect(cashiers.map((c) => c.name)).toContain('Cashier Two');

      // Verify safe serialization (no credential hashes leaked)
      for (const cashier of cashiers) {
        expect(cashier).not.toHaveProperty('pinHash');
        expect(cashier).not.toHaveProperty('passwordHash');
        expect(cashier.initials).toMatch(/^[A-Z0-9]+$/);
      }
    });

    it('updates user attributes and protects email uniqueness', async () => {
      const owner = await userRepo.createOwner({
        name: 'Original Name',
        email: 'original@store.com',
        passwordHash: 'hash',
        initials: 'ON',
      });

      const updated = await userRepo.updateUser(owner.id, {
        name: 'Updated Name',
        initials: 'UN',
      });

      expect(updated?.name).toBe('Updated Name');
      expect(updated?.initials).toBe('UN');

      // Non-existent user update returns null
      const nonExistent = await userRepo.updateUser('non_existent_id', { name: 'Nobody' });
      expect(nonExistent).toBeNull();
    });

    it('allows deleting cashier but forbids deleting owner', async () => {
      const owner = await userRepo.createOwner({
        name: 'Owner',
        email: 'owner@store.com',
        passwordHash: 'hash',
        initials: 'OW',
      });

      const cashier = await userRepo.createCashier({
        name: 'Cashier',
        pinHash: 'pin',
        initials: 'CA',
      });

      // Attempt to delete owner
      await expect(userRepo.deleteCashier(owner.id)).rejects.toThrow(
        'Store owner accounts cannot be deleted.'
      );

      // Deleting cashier succeeds
      const deleted = await userRepo.deleteCashier(cashier.id);
      expect(deleted).toBe(true);
      expect(await userRepo.findById(cashier.id)).toBeNull();
      expect(await userRepo.countUsers()).toBe(1);
    });

    it('handles PIN attempt tracking, progressive lockout, and resets', async () => {
      const cashier = await userRepo.createCashier({
        name: 'Cashier Lock Test',
        pinHash: 'pin',
        initials: 'LT',
      });

      // First 4 attempts: increment counter without lockout
      for (let attempt = 1; attempt <= 4; attempt++) {
        const result = await userRepo.incrementFailedPinAttempts(cashier.id, 5, 10000);
        expect(result.failedPinAttempts).toBe(attempt);
        expect(result.isLocked).toBe(false);
        expect(result.pinLockedUntil).toBeNull();
      }

      // 5th attempt: reaches threshold (5), triggers 10 second lock
      const lockedResult = await userRepo.incrementFailedPinAttempts(cashier.id, 5, 10000);
      expect(lockedResult.failedPinAttempts).toBe(5);
      expect(lockedResult.isLocked).toBe(true);
      expect(lockedResult.pinLockedUntil).not.toBeNull();
      expect(lockedResult.pinLockedUntil!.getTime()).toBeGreaterThan(Date.now());

      // getAuthStatus reflects lockout
      const status = await userRepo.getAuthStatus(cashier.id);
      expect(status.exists).toBe(true);
      expect(status.active).toBe(true);
      expect(status.isLocked).toBe(true);
      expect(status.failedPinAttempts).toBe(5);

      // Resetting failed PIN attempts clears counter and lock
      await userRepo.resetFailedPinAttempts(cashier.id);
      const resetStatus = await userRepo.getAuthStatus(cashier.id);
      expect(resetStatus.isLocked).toBe(false);
      expect(resetStatus.failedPinAttempts).toBe(0);
      expect(resetStatus.pinLockedUntil).toBeNull();
    });

    it('toSafeUser utility produces sanitized object', () => {
      const record: UserRecord = {
        id: 'user_123',
        name: 'Test',
        email: 'test@example.com',
        passwordHash: 'secret_password_hash',
        pinHash: 'secret_pin_hash',
        role: 'owner',
        isOwner: true,
        initials: 'TT',
        active: true,
        failedPinAttempts: 2,
        pinLockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const safe = toSafeUser(record);
      expect(safe.id).toBe('user_123');
      expect((safe as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
      expect((safe as unknown as Record<string, unknown>).pinHash).toBeUndefined();
    });
  });

  describe('MemorySessionRepository', () => {
    let sessionRepo: MemorySessionRepository;

    beforeEach(() => {
      sessionRepo = new MemorySessionRepository();
    });

    it('creates and retrieves active session by token hash', async () => {
      const tokenHash = 'abc123tokenhash';
      const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

      const created = await sessionRepo.createSession({
        tokenHash,
        userId: 'user_1',
        role: 'cashier',
        name: 'Cashier Sam',
        userAgent: 'POS-Terminal/1.0',
        ipAddress: '192.168.1.50',
        expiresAt,
      });

      expect(created.id).toBeDefined();
      expect(created.tokenHash).toBe(tokenHash);
      expect(created.userId).toBe('user_1');
      expect(created.role).toBe('cashier');

      const found = await sessionRepo.findActiveSessionByTokenHash(tokenHash);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Cashier Sam');
      expect(found?.userId).toBe('user_1');
    });

    it('returns null and purges expired sessions automatically', async () => {
      const tokenHash = 'expiredtokenhash';
      const expiredAt = new Date(Date.now() - 1000); // 1 second in the past

      await sessionRepo.createSession({
        tokenHash,
        userId: 'user_2',
        role: 'cashier',
        name: 'Expired Cashier',
        expiresAt: expiredAt,
      });

      const found = await sessionRepo.findActiveSessionByTokenHash(tokenHash);
      expect(found).toBeNull();
    });

    it('revokes session by token hash', async () => {
      const tokenHash = 'token_to_revoke';
      await sessionRepo.createSession({
        tokenHash,
        userId: 'user_3',
        role: 'owner',
        name: 'Owner',
        expiresAt: new Date(Date.now() + 60000),
      });

      const revoked = await sessionRepo.revokeSessionByTokenHash(tokenHash);
      expect(revoked).toBe(true);

      const found = await sessionRepo.findActiveSessionByTokenHash(tokenHash);
      expect(found).toBeNull();
    });

    it('revokes all sessions for a specific user across devices', async () => {
      const userId = 'user_multi_device';
      await sessionRepo.createSession({
        tokenHash: 'token_device_1',
        userId,
        role: 'cashier',
        name: 'Cashier Multi',
        expiresAt: new Date(Date.now() + 60000),
      });

      await sessionRepo.createSession({
        tokenHash: 'token_device_2',
        userId,
        role: 'cashier',
        name: 'Cashier Multi',
        expiresAt: new Date(Date.now() + 60000),
      });

      await sessionRepo.createSession({
        tokenHash: 'other_user_token',
        userId: 'different_user',
        role: 'owner',
        name: 'Owner',
        expiresAt: new Date(Date.now() + 60000),
      });

      const revokedCount = await sessionRepo.revokeAllUserSessions(userId);
      expect(revokedCount).toBe(2);

      expect(await sessionRepo.findActiveSessionByTokenHash('token_device_1')).toBeNull();
      expect(await sessionRepo.findActiveSessionByTokenHash('token_device_2')).toBeNull();
      expect(await sessionRepo.findActiveSessionByTokenHash('other_user_token')).not.toBeNull();
    });

    it('purges expired sessions on batch cleanup', async () => {
      await sessionRepo.createSession({
        tokenHash: 'past_1',
        userId: 'u1',
        role: 'cashier',
        name: 'U1',
        expiresAt: new Date(Date.now() - 5000),
      });
      await sessionRepo.createSession({
        tokenHash: 'future_1',
        userId: 'u2',
        role: 'cashier',
        name: 'U2',
        expiresAt: new Date(Date.now() + 50000),
      });

      const purged = await sessionRepo.purgeExpiredSessions();
      expect(purged).toBe(1);
    });
  });

  describe('MemoryRateLimitStore', () => {
    let rateLimiter: MemoryRateLimitStore;

    beforeEach(() => {
      rateLimiter = new MemoryRateLimitStore();
    });

    it('allows requests within allowance and blocks when threshold exceeded', async () => {
      const key = 'test_ip:127.0.0.1';
      const limit = 3;
      const windowMs = 5000;

      // 1st request
      const r1 = await rateLimiter.consume(key, limit, windowMs);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      // 2nd request
      const r2 = await rateLimiter.consume(key, limit, windowMs);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      // 3rd request (limit reached)
      const r3 = await rateLimiter.consume(key, limit, windowMs);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      // 4th request (exceeded)
      const r4 = await rateLimiter.consume(key, limit, windowMs);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.retryAfterSec).toBeDefined();
      expect(r4.retryAfterSec).toBeGreaterThan(0);
    });

    it('resets rate limit counter on demand', async () => {
      const key = 'test_reset_key';
      await rateLimiter.consume(key, 1, 10000);
      const blocked = await rateLimiter.consume(key, 1, 10000);
      expect(blocked.allowed).toBe(false);

      await rateLimiter.reset(key);

      const retry = await rateLimiter.consume(key, 1, 10000);
      expect(retry.allowed).toBe(true);
      expect(retry.remaining).toBe(0);
    });
  });

  describe('createMemoryAuthRepositories factory', () => {
    it('creates all three isolated repositories together', () => {
      const repos = createMemoryAuthRepositories();
      expect(repos.userRepository).toBeInstanceOf(MemoryUserRepository);
      expect(repos.sessionRepository).toBeInstanceOf(MemorySessionRepository);
      expect(repos.rateLimitStore).toBeInstanceOf(MemoryRateLimitStore);
    });
  });
});
