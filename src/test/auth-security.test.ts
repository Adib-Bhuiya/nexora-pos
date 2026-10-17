import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashPin,
  verifyPin,
  hashToken,
  verifySetupKey,
  verifyCsrfAndOrigin,
  checkRateLimit,
  extractTokenFromRequest,
  SESSION_COOKIE_NAME,
} from '@/lib/auth-server';

describe('Auth Security Core Utilities', () => {
  it('handles timingSafeEqual safely when setup-key inputs have different lengths', () => {
    process.env.OWNER_SETUP_KEY = 'super-secret-key-12345';

    // Exact match
    expect(verifySetupKey('super-secret-key-12345')).toBe(true);

    // Shorter key - must not throw length-mismatch error and must return false
    expect(() => verifySetupKey('short')).not.toThrow();
    expect(verifySetupKey('short')).toBe(false);

    // Much longer key - must not throw and must return false
    expect(() => verifySetupKey('a-very-long-string-that-is-way-longer-than-the-configured-key-value')).not.toThrow();
    expect(verifySetupKey('a-very-long-string-that-is-way-longer-than-the-configured-key-value')).toBe(false);

    // Empty or non-string inputs
    expect(verifySetupKey('')).toBe(false);
    expect(verifySetupKey(null)).toBe(false);
    expect(verifySetupKey(undefined)).toBe(false);
  });

  it('securely hashes and verifies owner passwords using bcrypt', async () => {
    const password = 'StrongPassword123!';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true); // bcrypt signature

    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('securely hashes and verifies cashier 6-digit PINs', async () => {
    const pin = '482910';
    const hash = await hashPin(pin);

    expect(hash).not.toBe(pin);
    expect(hash.startsWith('$2')).toBe(true);

    expect(await verifyPin(pin, hash)).toBe(true);
    expect(await verifyPin('000000', hash)).toBe(false);
    expect(await verifyPin('48291', hash)).toBe(false);
  });

  it('hashes session tokens with SHA-256 to a 64-character hex digest', () => {
    const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const tokenHash = hashToken(rawToken);

    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    // Deterministic hash
    expect(hashToken(rawToken)).toBe(tokenHash);
    // Distinct token produces distinct hash
    expect(hashToken('another-token')).not.toBe(tokenHash);
  });

  describe('CSRF & Origin Validation', () => {
    it('permits read-only GET requests without custom headers', () => {
      const req = new Request('http://localhost:3000/api/products', { method: 'GET' });
      const res = verifyCsrfAndOrigin(req);
      expect(res.valid).toBe(true);
    });

    it('rejects state-changing POST requests without X-Requested-With header', () => {
      const req = new Request('http://localhost:3000/api/products', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      });
      const res = verifyCsrfAndOrigin(req);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('X-Requested-With');
    });

    it('permits state-changing POST requests with valid custom header and trusted origin', () => {
      const req = new Request('http://localhost:3000/api/products', {
        method: 'POST',
        headers: {
          'x-requested-with': 'NexoraPOS',
          origin: 'http://localhost:3000',
        },
      });
      const res = verifyCsrfAndOrigin(req);
      expect(res.valid).toBe(true);
    });

    it('rejects state-changing POST requests with untrusted origin', () => {
      const req = new Request('http://localhost:3000/api/products', {
        method: 'POST',
        headers: {
          'x-requested-with': 'NexoraPOS',
          origin: 'https://evil-attacker-site.com',
        },
      });
      const res = verifyCsrfAndOrigin(req);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('not in trusted allowlist');
    });
  });

  describe('Rate Limiter', () => {
    it('enforces attempt limits and provides retry cooldowns', async () => {
      const testKey = `test-limit-${Date.now()}`;
      // Max 3 attempts in 10 seconds
      const r1 = await checkRateLimit(testKey, 3, 10000);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await checkRateLimit(testKey, 3, 10000);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await checkRateLimit(testKey, 3, 10000);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      // 4th attempt should be blocked
      const r4 = await checkRateLimit(testKey, 3, 10000);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.retryAfterSec).toBeGreaterThan(0);
    });
  });

  describe('Session Cookie Token Extraction', () => {
    it('extracts nexora_session token cleanly from cookie header', () => {
      const req = new Request('http://localhost:3000/api/auth/status', {
        headers: {
          cookie: `other_pref=dark; ${SESSION_COOKIE_NAME}=deadbeef1234567890abcdef; analytics_opt_out=true`,
        },
      });
      expect(extractTokenFromRequest(req)).toBe('deadbeef1234567890abcdef');
    });

    it('returns null when nexora_session cookie is missing', () => {
      const req = new Request('http://localhost:3000/api/auth/status', {
        headers: {
          cookie: 'other_pref=dark; something_else=foo',
        },
      });
      expect(extractTokenFromRequest(req)).toBeNull();
    });
  });
});
