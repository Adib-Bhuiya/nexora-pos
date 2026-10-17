/**
 * Legacy auth-server bridge.
 * Refactored in Stage 2 to delegate to the database-independent AuthService layer.
 * Concrete database adapter integration will be connected in Stage 3.
 */

export * from '@/lib/auth/security';

import {
  isAuthServiceConfigured,
  getAuthService,
  extractTokenFromRequest,
  buildClearCookieHeader,
  hashToken,
  SESSION_DURATION_MS,
  generateRawToken,
  buildSessionCookieHeader,
} from '@/lib/auth';
import type { AuthContext as AuthContextType } from '@/lib/auth';

export type AuthContext = AuthContextType;

// Fallback in-memory rate limiter for dev/test utilities when service is unconfigured
const memoryRateLimits = new Map<string, { count: number; expiresAt: number }>();

/**
 * Placeholder for index assurance. Concrete database indexes are managed
 * by the database repository adapter in Stage 3.
 */
export async function ensureAuthIndexes(): Promise<void> {
  // Database indexes will be managed exclusively by the Stage 3 database adapter.
}

/**
 * Delegating rate limiter. Uses configured AuthService rateLimitStore if available,
 * or falls back to in-memory store in isolated development/test environments.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; retryAfterSec?: number }> {
  if (isAuthServiceConfigured()) {
    const authService = getAuthService();
    const result = await (authService as unknown as { deps: { rateLimitStore: { consume: (k: string, m: number, w: number) => Promise<{ allowed: boolean; remaining: number; retryAfterSec?: number }> } } }).deps.rateLimitStore.consume(key, maxAttempts, windowMs);
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      retryAfterSec: result.retryAfterSec,
    };
  }

  const now = Date.now();
  const entry = memoryRateLimits.get(key);

  if (!entry || entry.expiresAt <= now) {
    memoryRateLimits.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  entry.count += 1;
  if (entry.count > maxAttempts) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return { allowed: true, remaining: maxAttempts - entry.count };
}

/**
 * Resolves session and authenticates incoming Request.
 * Derives authorization strictly from live repository records when configured.
 */
export async function getSessionUser(req: Request): Promise<AuthContext | null> {
  // Allow test runner authentication in test environment
  if (
    (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') &&
    req.headers.get('x-test-role')
  ) {
    const role = (req.headers.get('x-test-role') as 'owner' | 'cashier') || 'owner';
    return {
      session: {
        id: 'test-session-id',
        userId: '60d5ecb8b5c9c61234567890',
        role,
        name: 'Test User',
        expiresAt: new Date(Date.now() + 86400000),
      },
      user: {
        id: '60d5ecb8b5c9c61234567890',
        name: 'Test User',
        email: 'test@example.com',
        role,
        isOwner: role === 'owner',
        initials: 'TU',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  }

  if (isAuthServiceConfigured()) {
    return getAuthService().authenticateRequest(req);
  }

  return null;
}

/**
 * Creates a session using the active AuthService or generates test headers.
 */
export async function createSession(
  userId: string,
  role: 'owner' | 'cashier',
  name: string,
  req: Request
): Promise<{ rawToken: string; cookieHeader: string }> {
  if (isAuthServiceConfigured()) {
    const authService = getAuthService();
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await (authService as unknown as { deps: { sessionRepo: { createSession: (data: unknown) => Promise<unknown> } } }).deps.sessionRepo.createSession({
      tokenHash,
      userId,
      role,
      name,
      userAgent: req.headers.get('user-agent') || '',
      ipAddress: '127.0.0.1',
      expiresAt,
    });

    return {
      rawToken,
      cookieHeader: buildSessionCookieHeader(rawToken),
    };
  }

  const rawToken = generateRawToken();
  return {
    rawToken,
    cookieHeader: buildSessionCookieHeader(rawToken),
  };
}

/**
 * Revokes current session using active AuthService.
 */
export async function revokeSession(req: Request): Promise<string> {
  const rawToken = extractTokenFromRequest(req);
  if (isAuthServiceConfigured() && rawToken) {
    return getAuthService().logout(rawToken);
  }
  return buildClearCookieHeader();
}

/**
 * Revokes all active sessions for a user.
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  if (isAuthServiceConfigured()) {
    const authService = getAuthService();
    await (authService as unknown as { deps: { sessionRepo: { revokeAllUserSessions: (id: string) => Promise<number> } } }).deps.sessionRepo.revokeAllUserSessions(userId);
  }
}
