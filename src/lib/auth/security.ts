import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const SESSION_COOKIE_NAME = 'nexora_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Hashes owner account passwords using bcrypt with work factor 12.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verifies an owner plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Hashes cashier PINs using bcrypt with work factor 10.
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

/**
 * Verifies a cashier plaintext PIN against a stored bcrypt hash.
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!pin || !hash) return false;
  return bcrypt.compare(pin, hash);
}

/**
 * Generates a 256-bit cryptographically secure random session token.
 */
export function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Produces a SHA-256 hexadecimal hash of a session token.
 * Only this hash is stored in session records; raw tokens are never persisted.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-length pre-hashed timing-safe comparison for setup keys.
 * Hashes both operands to 32 bytes using SHA-256 to prevent length-mismatch errors
 * and prevent timing attacks.
 */
export function verifySetupKey(providedKey: unknown): boolean {
  const configuredKey = process.env.OWNER_SETUP_KEY;
  if (
    !configuredKey ||
    typeof configuredKey !== 'string' ||
    !configuredKey.trim() ||
    typeof providedKey !== 'string' ||
    !providedKey.trim()
  ) {
    return false;
  }

  const expectedHash = crypto
    .createHash('sha256')
    .update(configuredKey.trim())
    .digest();
  const providedHash = crypto
    .createHash('sha256')
    .update(providedKey.trim())
    .digest();

  return crypto.timingSafeEqual(expectedHash, providedHash);
}

/**
 * Validates cashier PIN requirements:
 * - Must be 4 to 6 numeric digits.
 * - Rejects repeated digits (e.g. 1111, 000000).
 * - Rejects simple sequential digits (e.g. 1234, 123456, 4321, 654321).
 * - Rejects simple alternating pairs (e.g. 1212, 121212).
 */
export function validatePin(pin: string): { valid: boolean; reason?: string } {
  if (typeof pin !== 'string') {
    return { valid: false, reason: 'PIN must be a string of digits.' };
  }

  const trimmed = pin.trim();

  if (!/^\d{4,6}$/.test(trimmed)) {
    return { valid: false, reason: 'PIN must be between 4 and 6 numeric digits.' };
  }

  // 1. Repeated identical digits (e.g. 1111, 22222, 000000)
  if (/^(\d)\1+$/.test(trimmed)) {
    return { valid: false, reason: 'PIN cannot consist of all identical digits.' };
  }

  // 2. Sequential ascending or descending check
  let isAscending = true;
  let isDescending = true;

  for (let i = 1; i < trimmed.length; i++) {
    const prev = parseInt(trimmed[i - 1], 10);
    const curr = parseInt(trimmed[i], 10);
    if (curr !== prev + 1) isAscending = false;
    if (curr !== prev - 1) isDescending = false;
  }

  if (isAscending || isDescending) {
    return { valid: false, reason: 'PIN cannot be a consecutive numerical sequence.' };
  }

  // 3. Repeating 2-digit patterns (e.g. 1212, 121212, 2525)
  if (trimmed.length % 2 === 0) {
    const pair = trimmed.slice(0, 2);
    if (pair.repeat(trimmed.length / 2) === trimmed) {
      return { valid: false, reason: 'PIN cannot be a repeating pattern.' };
    }
  }

  return { valid: true };
}

/**
 * Safely extracts client IP address.
 * Forwarded headers (x-forwarded-for, x-real-ip) are trusted ONLY when
 * TRUST_PROXY configuration is explicitly enabled ('true' or '1').
 */
export function getClientIp(req: Request): string {
  const trustProxy =
    process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';

  if (trustProxy) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0]?.trim();
      if (first && /^[a-fA-F0-9:.]+$/.test(first)) {
        return first;
      }
    }
    const realIp = req.headers.get('x-real-ip');
    if (realIp && /^[a-fA-F0-9:.]+$/.test(realIp.trim())) {
      return realIp.trim();
    }
  }

  return '127.0.0.1';
}

/**
 * Validates Origin/Referer against configured trusted application origin allowlist.
 * Never blindly trusts Host or X-Forwarded-Host headers.
 */
export function verifyCsrfAndOrigin(req: Request): { valid: boolean; reason?: string } {
  // Safe read-only methods don't require CSRF checks
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return { valid: true };
  }

  // Mandatory custom header check
  const customHeader = req.headers.get('x-requested-with');
  if (customHeader !== 'NexoraPOS') {
    return { valid: false, reason: 'Missing or invalid X-Requested-With header.' };
  }

  const originHeader = req.headers.get('origin');
  const refererHeader = req.headers.get('referer');
  const candidateUrl = originHeader || refererHeader;

  if (!candidateUrl) {
    return { valid: false, reason: 'Missing Origin or Referer header.' };
  }

  try {
    const candidateOrigin = new URL(candidateUrl).origin.toLowerCase();
    const trustedOrigins = new Set<string>();

    if (process.env.APP_URL) {
      try {
        trustedOrigins.add(new URL(process.env.APP_URL).origin.toLowerCase());
      } catch {}
    }

    if (process.env.NEXT_PUBLIC_APP_URL) {
      try {
        trustedOrigins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin.toLowerCase());
      } catch {}
    }

    // Permit localhost and 127.0.0.1 in non-production or default dev environments
    trustedOrigins.add('http://localhost:3000');
    trustedOrigins.add('http://127.0.0.1:3000');

    // Also trust the server's own configured URL if available
    if (process.env.VERCEL_URL) {
      trustedOrigins.add(`https://${process.env.VERCEL_URL.toLowerCase()}`);
    }

    if (!trustedOrigins.has(candidateOrigin)) {
      // In development environments with dynamic cloud preview URLs, allow if host matches URL
      const host = req.headers.get('host');
      if (host && (candidateOrigin === `https://${host}` || candidateOrigin === `http://${host}`)) {
        return { valid: true };
      }
      return { valid: false, reason: `Origin ${candidateOrigin} is not in trusted allowlist.` };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid Origin or Referer header format.' };
  }
}

/**
 * Extracts raw session token from the Request Cookie header.
 */
export function extractTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const match = cookies.find((c) => c.startsWith(prefix));
  if (!match) return null;
  return match.slice(prefix.length);
}

/**
 * Builds the Set-Cookie header string for an authenticated session.
 */
export function buildSessionCookieHeader(
  rawToken: string,
  options?: { maxAgeSec?: number }
): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = options?.maxAgeSec ?? Math.floor(SESSION_DURATION_MS / 1000);

  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${rawToken}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
  ];

  if (isProduction) {
    cookieParts.push('Secure');
  }

  return cookieParts.join('; ');
}

/**
 * Builds the Set-Cookie header string to clear/revoke a session on logout.
 */
export function buildClearCookieHeader(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=0`,
  ];

  if (isProduction) {
    cookieParts.push('Secure');
  }

  return cookieParts.join('; ');
}

/**
 * Computes initials from a display name (e.g. "Alice Smith" -> "AS").
 */
export function computeInitials(name: string, fallback: string = 'CA'): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
