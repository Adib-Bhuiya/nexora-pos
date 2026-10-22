import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  AuthService,
  AuthForbiddenError,
  AuthRateLimitError,
  createMemoryAuthRepositories,
  hashPassword,
  hashPin,
  verifyPassword,
  verifyPin,
} from '@/lib/auth';
import type { SafeUser, UserRecord } from '@/lib/auth/types';

describe('Auth Recovery & Cashier PIN Reset Flows', () => {
  let repos: ReturnType<typeof createMemoryAuthRepositories>;
  let mockEmailSender: Mock<(to: string, resetUrl: string) => Promise<{ success: boolean; messageId?: string; error?: string }>>;
  let authService: AuthService;

  let ownerUser: UserRecord;
  let cashierUser: UserRecord;
  let safeOwner: SafeUser;
  let safeCashier: SafeUser;

  beforeEach(async () => {
    repos = createMemoryAuthRepositories();
    mockEmailSender = vi.fn<(to: string, resetUrl: string) => Promise<{ success: boolean; messageId?: string; error?: string }>>().mockResolvedValue({ success: true, messageId: 'msg-123' });

    authService = new AuthService({
      userRepo: repos.userRepository,
      sessionRepo: repos.sessionRepository,
      rateLimitStore: repos.rateLimitStore,
      passwordResetTokenRepo: repos.passwordResetTokenRepository,
      emailSender: (to: string, resetUrl: string) => mockEmailSender(to, resetUrl),
    });

    process.env.APP_BASE_URL = 'https://pos.store.example.com';
    process.env.RESEND_API_KEY = 're_test_key_123';

    // Seed owner user
    const ownerPasswordHash = await hashPassword('InitialOwnerPass123');
    ownerUser = await repos.userRepository.createOwner({
      name: 'Jane Owner',
      email: 'owner@store.com',
      passwordHash: ownerPasswordHash,
      initials: 'JO',
    });
    safeOwner = {
      id: ownerUser.id,
      name: ownerUser.name,
      email: ownerUser.email,
      role: 'owner',
      isOwner: true,
      initials: ownerUser.initials,
      active: true,
      createdAt: ownerUser.createdAt,
      updatedAt: ownerUser.updatedAt,
    };

    // Seed cashier user
    const cashierPinHash = await hashPin('482901');
    cashierUser = await repos.userRepository.createCashier({
      name: 'Sam Cashier',
      pinHash: cashierPinHash,
      initials: 'SC',
      active: true,
    });
    safeCashier = {
      id: cashierUser.id,
      name: cashierUser.name,
      email: '',
      role: 'cashier',
      isOwner: false,
      initials: cashierUser.initials,
      active: true,
      createdAt: cashierUser.createdAt,
      updatedAt: cashierUser.updatedAt,
    };
  });

  afterEach(() => {
    delete process.env.APP_BASE_URL;
    delete process.env.RESEND_API_KEY;
  });

  describe('Part A: Owner Password Recovery via Email', () => {
    describe('forgotPassword endpoint logic', () => {
      it('rejects unregistered recovery email with clear message and does not send email', async () => {
        await expect(
          authService.forgotPassword({
            email: 'nonexistent@store.com',
            ipAddress: '192.168.1.10',
          })
        ).rejects.toThrow('Invalid recovery email. Please enter the email address registered to the store owner account.');

        expect(mockEmailSender).not.toHaveBeenCalled();
      });

      it('rejects recovery request for non-owner/cashier email with clear message and does not send email', async () => {
        await repos.userRepository.updateUser(cashierUser.id, { email: 'cashier@store.com' });

        await expect(
          authService.forgotPassword({
            email: 'cashier@store.com',
            ipAddress: '192.168.1.11',
          })
        ).rejects.toThrow('Invalid recovery email. Please enter the email address registered to the store owner account.');

        expect(mockEmailSender).not.toHaveBeenCalled();
      });

      it('dispatches reset email to valid owner and constructs link using configured base URL', async () => {
        const res = await authService.forgotPassword({
          email: ' OWNER@STORE.COM ',
          ipAddress: '192.168.1.12',
        });

        expect(res.message).toContain('Password reset instructions have been sent');
        expect(mockEmailSender).toHaveBeenCalledTimes(1);

        const [recipient, resetUrl] = mockEmailSender.mock.calls[0];
        expect(recipient).toBe('owner@store.com');
        expect(resetUrl).toContain('https://pos.store.example.com/reset-password?token=');

        // Extract raw token from resetUrl
        const url = new URL(resetUrl);
        const token = url.searchParams.get('token');
        expect(token).toBeTruthy();
        expect(token!.length).toBe(64); // 32 bytes in hex = 64 characters
      });

      it('enforces 15-minute cooldown on subsequent accepted reset requests', async () => {
        // 1st request succeeds
        const res1 = await authService.forgotPassword({
          email: 'owner@store.com',
          ipAddress: '192.168.1.15',
        });
        expect(res1.message).toContain('Password reset instructions have been sent');
        expect(mockEmailSender).toHaveBeenCalledTimes(1);

        // 2nd request during cooldown is rejected by server
        await expect(
          authService.forgotPassword({
            email: 'owner@store.com',
            ipAddress: '192.168.1.16',
          })
        ).rejects.toThrow(/You recently requested a password reset\. Please wait before requesting another one/);

        // Crucial: no duplicate reset email dispatched during cooldown
        expect(mockEmailSender).toHaveBeenCalledTimes(1);
      });

      it('enforces IP rate limiting on forgotPassword requests', async () => {
        const ip = '10.0.0.50';
        for (let i = 0; i < 5; i++) {
          await expect(
            authService.forgotPassword({ email: `unregistered${i}@store.com`, ipAddress: ip })
          ).rejects.toThrow(/Invalid recovery email/);
        }

        // 6th attempt should be rate limited by IP
        await expect(
          authService.forgotPassword({ email: 'owner@store.com', ipAddress: ip })
        ).rejects.toThrow(AuthRateLimitError);
      });

      it('enforces email rate limiting on forgotPassword requests', async () => {
        for (let i = 0; i < 3; i++) {
          await expect(
            authService.forgotPassword({ email: 'cashier-invalid@store.com', ipAddress: `10.0.1.${i}` })
          ).rejects.toThrow(/Invalid recovery email/);
        }

        // 4th attempt from different IP but same email should be rate limited by email
        await expect(
          authService.forgotPassword({ email: 'cashier-invalid@store.com', ipAddress: '10.0.1.99' })
        ).rejects.toThrow(/Too many reset requests for this email address/);
      });

      it('invalidates previous active reset tokens when a new one is requested after cooldown', async () => {
        // Request 1st token
        await authService.forgotPassword({ email: 'owner@store.com', ipAddress: '192.168.1.20' });
        const firstTokenUrl = mockEmailSender.mock.calls[0][1];
        const firstToken = new URL(firstTokenUrl).searchParams.get('token')!;

        // Reset cooldown to simulate cooldown expiration
        await repos.rateLimitStore.reset(`forgot_cooldown:${ownerUser.id}`);

        // Request 2nd token
        await authService.forgotPassword({ email: 'owner@store.com', ipAddress: '192.168.1.21' });
        const secondTokenUrl = mockEmailSender.mock.calls[1][1];
        const secondToken = new URL(secondTokenUrl).searchParams.get('token')!;

        // Attempting to consume first token should fail because it was invalidated
        await expect(
          authService.resetPassword({
            token: firstToken,
            password: 'NewStrongPassword123',
          })
        ).rejects.toThrow(/Invalid, expired, or already-used/);

        // Second token should succeed
        const resetRes = await authService.resetPassword({
          token: secondToken,
          password: 'NewStrongPassword123',
        });
        expect(resetRes.message).toBe('Password reset successfully. You can now sign in with your new password.');
      });

      it('fails with safe error when email service is unconfigured', async () => {
        const unconfiguredService = new AuthService({
          userRepo: repos.userRepository,
          sessionRepo: repos.sessionRepository,
          rateLimitStore: repos.rateLimitStore,
          passwordResetTokenRepo: repos.passwordResetTokenRepository,
          // no emailSender
        });
        delete process.env.RESEND_API_KEY;

        await expect(
          unconfiguredService.forgotPassword({
            email: 'owner@store.com',
            ipAddress: '192.168.1.30',
          })
        ).rejects.toThrow('Email delivery service is currently not configured on this server.');
      });

      it('cleans up cooldown if email delivery fails, allowing the owner to retry', async () => {
        mockEmailSender.mockResolvedValueOnce({ success: false, error: 'SMTP delivery timeout' });

        await expect(
          authService.forgotPassword({
            email: 'owner@store.com',
            ipAddress: '192.168.1.31',
          })
        ).rejects.toThrow('SMTP delivery timeout');

        // Because early cooldown cleanup occurred, the retry is not blocked by cooldown
        mockEmailSender.mockResolvedValueOnce({ success: true, messageId: 'msg-retry-ok' });
        const retryRes = await authService.forgotPassword({
          email: 'owner@store.com',
          ipAddress: '192.168.1.32',
        });
        expect(retryRes.message).toContain('Password reset instructions have been sent');
      });

      it('cleans up cooldown if token creation fails, allowing the owner to retry', async () => {
        const createTokenSpy = vi.spyOn(repos.passwordResetTokenRepository, 'createToken').mockRejectedValueOnce(
          new Error('Database write failure')
        );

        await expect(
          authService.forgotPassword({
            email: 'owner@store.com',
            ipAddress: '192.168.1.33',
          })
        ).rejects.toThrow('Database write failure');

        createTokenSpy.mockRestore();

        // Retry should succeed because cooldown was cleaned up on failure
        const retryRes = await authService.forgotPassword({
          email: 'owner@store.com',
          ipAddress: '192.168.1.34',
        });
        expect(retryRes.message).toContain('Password reset instructions have been sent');
      });
    });

    describe('resetPassword endpoint logic', () => {
      let validToken: string;

      beforeEach(async () => {
        await authService.forgotPassword({
          email: 'owner@store.com',
          ipAddress: '192.168.1.40',
        });
        const resetUrl = mockEmailSender.mock.calls[0][1];
        validToken = new URL(resetUrl).searchParams.get('token')!;
      });

      it('successfully resets owner password, updates hash, and does not auto-login', async () => {
        // Create an active session for the owner
        await repos.sessionRepository.createSession({
          tokenHash: 'session-hash-owner-1',
          userId: ownerUser.id,
          role: 'owner',
          name: ownerUser.name,
          expiresAt: new Date(Date.now() + 1000000),
        });

        const res = await authService.resetPassword({
          token: validToken,
          password: 'BrandNewOwnerPassword456',
          confirmPassword: 'BrandNewOwnerPassword456',
        });

        expect(res.message).toContain('successfully');
        expect(res.message).toContain('sign in with your new password');

        // Check updated password in user repo
        const updated = await repos.userRepository.findById(ownerUser.id);
        expect(await verifyPassword('BrandNewOwnerPassword456', updated!.passwordHash)).toBe(true);
        expect(await verifyPassword('InitialOwnerPass123', updated!.passwordHash)).toBe(false);

        // Verify active session was revoked
        const session = await repos.sessionRepository.findActiveSessionByTokenHash('session-hash-owner-1');
        expect(session).toBeNull();

        // Verify subsequent login with new password succeeds and old password fails
        const loginRes = await authService.loginOwner({
          email: ownerUser.email,
          password: 'BrandNewOwnerPassword456',
        });
        expect(loginRes.user.id).toBe(ownerUser.id);

        await expect(
          authService.loginOwner({
            email: ownerUser.email,
            password: 'InitialOwnerPass123',
          })
        ).rejects.toThrow('Invalid email or password.');

        // Verify cooldown remains active for the full 15 minutes even after successful password reset
        await expect(
          authService.forgotPassword({
            email: ownerUser.email,
            ipAddress: '192.168.1.99',
          })
        ).rejects.toThrow(/You recently requested a password reset\. Please wait before requesting another one/);

        // Verify that once cooldown actually expires/resets, a new request is permitted
        await repos.rateLimitStore.reset(`forgot_cooldown:${ownerUser.id}`);
        const futureForgotRes = await authService.forgotPassword({
          email: ownerUser.email,
          ipAddress: '192.168.1.99',
        });
        expect(futureForgotRes.message).toContain('Password reset instructions have been sent');
      });

      it('rejects passwords shorter than 8 characters', async () => {
        await expect(
          authService.resetPassword({
            token: validToken,
            password: 'short',
          })
        ).rejects.toThrow(/at least 8 characters/);
      });

      it('rejects mismatched password and confirmation', async () => {
        await expect(
          authService.resetPassword({
            token: validToken,
            password: 'ValidPassword123',
            confirmPassword: 'DifferentPassword123',
          })
        ).rejects.toThrow(/Passwords do not match/);
      });

      it('enforces single-use token consumption and rejects reuse', async () => {
        // First consumption
        await authService.resetPassword({
          token: validToken,
          password: 'NewValidPassword123',
        });

        // Second consumption attempt with the same token
        await expect(
          authService.resetPassword({
            token: validToken,
            password: 'AnotherPassword456',
          })
        ).rejects.toThrow(/Invalid, expired, or already-used/);
      });

      it('rejects expired tokens', async () => {
        // Advance time by mocking token expiration in repo
        const rawToken = 'test-expired-token-raw';
        const crypto = await import('crypto');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        await repos.passwordResetTokenRepository.createToken({
          userId: ownerUser.id,
          email: ownerUser.email,
          tokenHash,
          expiresAt: new Date(Date.now() - 1000), // expired in past
        });

        await expect(
          authService.resetPassword({
            token: rawToken,
            password: 'NewValidPassword123',
          })
        ).rejects.toThrow(/Invalid, expired, or already-used/);
      });
    });
  });

  describe('Part B: Cashier Forgotten PIN Reset by Owner', () => {
    it('allows authenticated owner to reset a cashier PIN and verifies matching confirmation', async () => {
      // Create an active session for the cashier
      await repos.sessionRepository.createSession({
        tokenHash: 'session-hash-cashier-1',
        userId: cashierUser.id,
        role: 'cashier',
        name: cashierUser.name,
        expiresAt: new Date(Date.now() + 1000000),
      });

      const updatedCashier = await authService.resetCashierPin(safeOwner, cashierUser.id, {
        pin: '591820',
        confirmPin: '591820',
      });

      expect(updatedCashier.id).toBe(cashierUser.id);

      // Verify the new PIN works with bcrypt
      const refreshed = await repos.userRepository.findById(cashierUser.id);
      expect(await verifyPin('591820', refreshed!.pinHash)).toBe(true);
      expect(await verifyPin('482901', refreshed!.pinHash)).toBe(false);

      // Verify that active sessions for that cashier were revoked
      const session = await repos.sessionRepository.findActiveSessionByTokenHash('session-hash-cashier-1');
      expect(session).toBeNull();
    });

    it('clears failed PIN attempts and removes lockout when owner resets cashier PIN', async () => {
      // Lock the cashier account with 5 consecutive failed attempts
      for (let i = 0; i < 5; i++) {
        await repos.userRepository.incrementFailedPinAttempts(cashierUser.id, 5, 15 * 60 * 1000);
      }
      let status = await repos.userRepository.getAuthStatus(cashierUser.id);
      expect(status.isLocked).toBe(true);

      // Owner resets PIN
      await authService.resetCashierPin(safeOwner, cashierUser.id, {
        pin: '739104',
        confirmPin: '739104',
      });

      // Verify lockout is cleared
      status = await repos.userRepository.getAuthStatus(cashierUser.id);
      expect(status.isLocked).toBe(false);
      expect(status.failedPinAttempts).toBe(0);
    });

    it('rejects PIN reset request if actor is a cashier rather than an owner', async () => {
      await expect(
        authService.resetCashierPin(safeCashier, cashierUser.id, {
          pin: '739104',
        })
      ).rejects.toThrow(AuthForbiddenError);
    });

    it('rejects attempts to reset the store owner credentials via cashier PIN reset', async () => {
      await expect(
        authService.resetCashierPin(safeOwner, ownerUser.id, {
          pin: '739104',
        })
      ).rejects.toThrow(/Store owner credentials cannot be reset/);
    });

    it('rejects trivial or non-compliant PINs (repeated or sequential digits)', async () => {
      await expect(
        authService.resetCashierPin(safeOwner, cashierUser.id, {
          pin: '111111',
        })
      ).rejects.toThrow(/identical digits/);

      await expect(
        authService.resetCashierPin(safeOwner, cashierUser.id, {
          pin: '123456',
        })
      ).rejects.toThrow(/consecutive numerical sequence/);
    });

    it('rejects when PIN and confirmation PIN do not match', async () => {
      await expect(
        authService.resetCashierPin(safeOwner, cashierUser.id, {
          pin: '839201',
          confirmPin: '839202',
        })
      ).rejects.toThrow('PIN confirmation does not match.');
    });
  });
});
