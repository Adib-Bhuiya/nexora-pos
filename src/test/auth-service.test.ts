import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AuthService,
  AuthForbiddenError,
  AuthUnauthorizedError,
  AuthRateLimitError,
  AuthConfigurationError,
  createMemoryAuthRepositories,
  validatePin,
  getClientIp,
  getAuthService,
  setAuthRepositories,
} from '@/lib/auth';

describe('AuthService Layer (Stage 2)', () => {
  let repos: ReturnType<typeof createMemoryAuthRepositories>;
  let authService: AuthService;

  beforeEach(() => {
    repos = createMemoryAuthRepositories();
    authService = new AuthService({
      userRepo: repos.userRepository,
      sessionRepo: repos.sessionRepository,
      rateLimitStore: repos.rateLimitStore,
    });
    setAuthRepositories({
      userRepo: repos.userRepository,
      sessionRepo: repos.sessionRepository,
      rateLimitStore: repos.rateLimitStore,
    });
    process.env.OWNER_SETUP_KEY = 'test-owner-setup-key';
  });

  afterEach(() => {
    setAuthRepositories(null);
  });

  describe('PIN Validation', () => {
    it('accepts valid 4 to 6 digit numeric non-trivial PINs', () => {
      expect(validatePin('4829').valid).toBe(true);
      expect(validatePin('940251').valid).toBe(true);
      expect(validatePin('58301').valid).toBe(true);
      expect(validatePin('7391').valid).toBe(true);
    });

    it('rejects PINs outside 4 to 6 digits range', () => {
      expect(validatePin('123').valid).toBe(false);
      expect(validatePin('123').reason).toContain('between 4 and 6 numeric digits');
      expect(validatePin('1234567').valid).toBe(false);
      expect(validatePin('1234567').reason).toContain('between 4 and 6 numeric digits');
      expect(validatePin('').valid).toBe(false);
      expect(validatePin('abcd').valid).toBe(false);
    });

    it('rejects repeated identical digits', () => {
      expect(validatePin('0000').valid).toBe(false);
      expect(validatePin('0000').reason).toContain('identical digits');
      expect(validatePin('111111').valid).toBe(false);
      expect(validatePin('9999').valid).toBe(false);
    });

    it('rejects sequential ascending digits', () => {
      expect(validatePin('1234').valid).toBe(false);
      expect(validatePin('1234').reason).toContain('consecutive numerical sequence');
      expect(validatePin('23456').valid).toBe(false);
      expect(validatePin('123456').valid).toBe(false);
      expect(validatePin('0123').valid).toBe(false);
    });

    it('rejects sequential descending digits', () => {
      expect(validatePin('4321').valid).toBe(false);
      expect(validatePin('4321').reason).toContain('consecutive numerical sequence');
      expect(validatePin('654321').valid).toBe(false);
      expect(validatePin('9876').valid).toBe(false);
    });

    it('rejects repeating 2-digit patterns', () => {
      expect(validatePin('1212').valid).toBe(false);
      expect(validatePin('1212').reason).toContain('repeating pattern');
      expect(validatePin('121212').valid).toBe(false);
      expect(validatePin('2525').valid).toBe(false);
    });
  });

  describe('Client IP Extraction & Proxy Header Policy', () => {
    it('ignores x-forwarded-for by default when TRUST_PROXY is not enabled', () => {
      delete process.env.TRUST_PROXY;
      const req = new Request('http://localhost:3000', {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
      });
      expect(getClientIp(req)).toBe('127.0.0.1');
    });

    it('trusts x-forwarded-for first IP only when TRUST_PROXY=true', () => {
      process.env.TRUST_PROXY = 'true';
      const req = new Request('http://localhost:3000', {
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
      });
      expect(getClientIp(req)).toBe('203.0.113.195');
      delete process.env.TRUST_PROXY;
    });
  });

  describe('Owner Setup', () => {
    it('initializes owner account once and rejects duplicate setup', async () => {
      const result = await authService.setupOwner({
        setupKey: 'test-owner-setup-key',
        name: 'Alice Owner',
        email: 'alice@store.com',
        password: 'SecurePassword123!',
        pin: '9482',
        ipAddress: '192.168.1.10',
      });

      expect(result.user.id).toBeDefined();
      expect(result.user.name).toBe('Alice Owner');
      expect(result.user.email).toBe('alice@store.com');
      expect(result.user.role).toBe('owner');
      expect(result.user.isOwner).toBe(true);
      expect(result.cookieHeader).toContain('nexora_session=');
      expect(result.cookieHeader).toContain('HttpOnly');
      expect(result.cookieHeader).toContain('SameSite=Lax');

      // Safe user projection never exposes password or PIN hash
      expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
      expect((result.user as unknown as Record<string, unknown>).pinHash).toBeUndefined();

      // Session record stores SHA-256 hash, not plaintext token
      expect(result.session.tokenHash).not.toBe(result.rawToken);
      expect(result.session.tokenHash).toHaveLength(64);

      // Attempting second setup must be rejected
      await expect(
        authService.setupOwner({
          setupKey: 'test-owner-setup-key',
          name: 'Bob Imposter',
          email: 'bob@store.com',
          password: 'AnotherPassword123!',
        })
      ).rejects.toThrow(AuthForbiddenError);
    });

    it('rejects owner setup with invalid setup key', async () => {
      await expect(
        authService.setupOwner({
          setupKey: 'wrong-key',
          name: 'Alice Owner',
          email: 'alice@store.com',
          password: 'SecurePassword123!',
        })
      ).rejects.toThrow('Invalid owner setup key.');
    });

    it('rejects owner setup with weak password (< 8 chars)', async () => {
      await expect(
        authService.setupOwner({
          setupKey: 'test-owner-setup-key',
          name: 'Alice Owner',
          email: 'alice@store.com',
          password: 'short',
        })
      ).rejects.toThrow('at least 8 characters');
    });

    it('rejects owner setup with invalid PIN format', async () => {
      await expect(
        authService.setupOwner({
          setupKey: 'test-owner-setup-key',
          name: 'Alice Owner',
          email: 'alice@store.com',
          password: 'SecurePassword123!',
          pin: '1234', // sequential
        })
      ).rejects.toThrow('consecutive numerical sequence');
    });
  });

  describe('Owner Password Login', () => {
    beforeEach(async () => {
      await authService.setupOwner({
        setupKey: 'test-owner-setup-key',
        name: 'Alice Owner',
        email: 'alice@store.com',
        password: 'SecurePassword123!',
        pin: '9482',
      });
    });

    it('logs in successfully with correct credentials', async () => {
      const result = await authService.loginOwner({
        email: 'ALICE@STORE.COM', // case insensitive
        password: 'SecurePassword123!',
      });

      expect(result.user.id).toBeDefined();
      expect(result.user.name).toBe('Alice Owner');
      expect(result.rawToken).toBeDefined();
      expect(result.cookieHeader).toContain('nexora_session=');

      // Verify safe projection
      expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it('rejects invalid password', async () => {
      await expect(
        authService.loginOwner({
          email: 'alice@store.com',
          password: 'WrongPassword!',
        })
      ).rejects.toThrow(AuthUnauthorizedError);
    });

    it('rejects non-existent email', async () => {
      await expect(
        authService.loginOwner({
          email: 'nobody@store.com',
          password: 'SomePassword123!',
        })
      ).rejects.toThrow(AuthUnauthorizedError);
    });

    it('rejects login for deactivated owner account', async () => {
      const owner = await repos.userRepository.findByEmail('alice@store.com');
      await repos.userRepository.updateUser(owner!.id, { active: false });

      await expect(
        authService.loginOwner({
          email: 'alice@store.com',
          password: 'SecurePassword123!',
        })
      ).rejects.toThrow('inactive');
    });
  });

  describe('Cashier PIN Login & Lockout Protection', () => {
    let cashierId: string;

    beforeEach(async () => {
      const setup = await authService.setupOwner({
        setupKey: 'test-owner-setup-key',
        name: 'Store Owner',
        email: 'owner@store.com',
        password: 'Password123!',
      });

      const cashier = await authService.createCashier(setup.user, {
        name: 'Cashier Bob',
        pin: '8392',
      });
      cashierId = cashier.id;
    });

    it('logs in successfully with valid PIN', async () => {
      const result = await authService.loginPin({
        userId: cashierId,
        pin: '8392',
      });

      expect(result.user.name).toBe('Cashier Bob');
      expect(result.user.role).toBe('cashier');
      expect(result.cookieHeader).toContain('nexora_session=');
    });

    it('rejects invalid PIN and tracks failed attempts', async () => {
      await expect(
        authService.loginPin({
          userId: cashierId,
          pin: '9991',
        })
      ).rejects.toThrow(/Invalid PIN\. 4 attempts remaining\./);
    });

    it('enforces lockout after 5 consecutive failed PIN attempts', async () => {
      for (let i = 1; i <= 4; i++) {
        await expect(
          authService.loginPin({ userId: cashierId, pin: '9991' })
        ).rejects.toThrow(AuthUnauthorizedError);
      }

      // 5th attempt triggers lockout
      await expect(
        authService.loginPin({ userId: cashierId, pin: '9991' })
      ).rejects.toThrow(/Account locked due to 5 consecutive failed PIN attempts/);

      // Subsequent attempt is blocked by lockout
      await expect(
        authService.loginPin({ userId: cashierId, pin: '8392' }) // Even with right PIN
      ).rejects.toThrow(/temporarily locked/);
    });

    it('resets failed attempt counter on successful PIN login', async () => {
      // 2 failed attempts
      await expect(
        authService.loginPin({ userId: cashierId, pin: '9991' })
      ).rejects.toThrow(AuthUnauthorizedError);
      await expect(
        authService.loginPin({ userId: cashierId, pin: '9991' })
      ).rejects.toThrow(AuthUnauthorizedError);

      // Successful login resets
      const login = await authService.loginPin({ userId: cashierId, pin: '8392' });
      expect(login.user.id).toBe(cashierId);

      const status = await repos.userRepository.getAuthStatus(cashierId);
      expect(status.failedPinAttempts).toBe(0);
    });

    it('rejects PIN login for deactivated cashier', async () => {
      const owner = (await repos.userRepository.findByEmail('owner@store.com'))!;
      await authService.updateUser(
        {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          role: 'owner',
          isOwner: true,
          initials: owner.initials,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        cashierId,
        { active: false }
      );

      await expect(
        authService.loginPin({ userId: cashierId, pin: '8392' })
      ).rejects.toThrow(/deactivated/);
    });
  });

  describe('Session Resolution, Revocation, and Logout', () => {
    it('resolves active session and returns live role from user record', async () => {
      const setup = await authService.setupOwner({
        setupKey: 'test-owner-setup-key',
        name: 'Store Owner',
        email: 'owner@store.com',
        password: 'Password123!',
      });

      const context = await authService.resolveSession(setup.rawToken);
      expect(context).not.toBeNull();
      expect(context?.user.id).toBe(setup.user.id);
      expect(context?.session.role).toBe('owner');
    });

    it('logout revokes session and invalidates subsequent resolution', async () => {
      const setup = await authService.setupOwner({
        setupKey: 'test-owner-setup-key',
        name: 'Store Owner',
        email: 'owner@store.com',
        password: 'Password123!',
      });

      const clearHeader = await authService.logout(setup.rawToken);
      expect(clearHeader).toContain('Max-Age=0');

      const context = await authService.resolveSession(setup.rawToken);
      expect(context).toBeNull();
    });

    it('deactivating user revokes all active sessions across devices', async () => {
      const setup = await authService.setupOwner({
        setupKey: 'test-owner-setup-key',
        name: 'Store Owner',
        email: 'owner@store.com',
        password: 'Password123!',
      });

      const cashier = await authService.createCashier(setup.user, {
        name: 'Cashier Multi',
        pin: '7491',
      });

      // Login on device 1
      const sess1 = await authService.loginPin({ userId: cashier.id, pin: '7491' });
      // Login on device 2
      const sess2 = await authService.loginPin({ userId: cashier.id, pin: '7491' });

      expect(await authService.resolveSession(sess1.rawToken)).not.toBeNull();
      expect(await authService.resolveSession(sess2.rawToken)).not.toBeNull();

      // Deactivate cashier
      await authService.updateUser(setup.user, cashier.id, { active: false });

      // Both sessions must now be revoked
      expect(await authService.resolveSession(sess1.rawToken)).toBeNull();
      expect(await authService.resolveSession(sess2.rawToken)).toBeNull();
    });
  });

  describe('Role-Based Authorization & Staff Management', () => {
    it('prevents non-owners from creating or deleting cashier accounts', async () => {
      const setup = await authService.setupOwner({
        setupKey: 'test-owner-setup-key',
        name: 'Store Owner',
        email: 'owner@store.com',
        password: 'Password123!',
      });

      const cashier = await authService.createCashier(setup.user, {
        name: 'Cashier Sam',
        pin: '6194',
      });

      // Cashier tries to create staff account
      await expect(
        authService.createCashier(cashier, { name: 'Unauthorized', pin: '8204' })
      ).rejects.toThrow('Only store owners can create cashier accounts.');

      // Cashier tries to delete staff account
      await expect(
        authService.deleteCashier(cashier, cashier.id)
      ).rejects.toThrow('Only store owners can delete staff accounts.');
    });

    it('forbids deactivating the primary store owner', async () => {
      const setup = await authService.setupOwner({
        setupKey: 'test-owner-setup-key',
        name: 'Store Owner',
        email: 'owner@store.com',
        password: 'Password123!',
      });

      await expect(
        authService.updateUser(setup.user, setup.user.id, { active: false })
      ).rejects.toThrow('cannot be deactivated');
    });
  });

  describe('Rate Limiting', () => {
    it('enforces limit on login attempts from the same IP', async () => {
      await authService.setupOwner({
        setupKey: 'test-owner-setup-key',
        name: 'Store Owner',
        email: 'owner@store.com',
        password: 'Password123!',
      });

      const ip = '198.51.100.25';
      for (let i = 0; i < 5; i++) {
        await expect(
          authService.loginOwner({
            email: 'owner@store.com',
            password: 'BadPassword',
            ipAddress: ip,
          })
        ).rejects.toThrow(AuthUnauthorizedError);
      }

      // 6th attempt triggers 429 rate limit
      await expect(
        authService.loginOwner({
          email: 'owner@store.com',
          password: 'Password123!',
          ipAddress: ip,
        })
      ).rejects.toThrow(AuthRateLimitError);
    });
  });

  describe('Production Configuration Boundary (Fail Closed)', () => {
    it('throws AuthConfigurationError when dependencies are not configured, rather than falling back to memory', () => {
      setAuthRepositories(null);

      expect(() => getAuthService()).toThrow(AuthConfigurationError);
      expect(() => getAuthService()).toThrow(
        /Authentication repository is not configured\. MongoDB database adapter must be integrated in Stage 3\./
      );
    });
  });
});
