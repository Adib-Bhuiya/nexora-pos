import type {
  IUserRepository,
  ISessionRepository,
  IRateLimitStore,
} from './repositories';
import type {
  AuthContext,
  AuthResult,
  CreateCashierServiceInput,
  LoginOwnerServiceInput,
  LoginPinServiceInput,
  SafeUser,
  SetupOwnerServiceInput,
  UpdateUserServiceInput,
  UserRole,
} from './types';
import { toSafeUser } from './memory-repositories';
import {
  buildClearCookieHeader,
  buildSessionCookieHeader,
  computeInitials,
  extractTokenFromRequest,
  generateRawToken,
  hashPassword,
  hashPin,
  hashToken,
  SESSION_DURATION_MS,
  validatePin,
  verifyPassword,
  verifyPin,
  verifySetupKey,
} from './security';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class AuthRateLimitError extends AuthError {
  constructor(
    message: string,
    public readonly retryAfterSec: number
  ) {
    super(message, 429);
    this.name = 'AuthRateLimitError';
  }
}

export class AuthForbiddenError extends AuthError {
  constructor(message: string = 'Access denied.') {
    super(message, 403);
    this.name = 'AuthForbiddenError';
  }
}

export class AuthUnauthorizedError extends AuthError {
  constructor(message: string = 'Authentication required.') {
    super(message, 401);
    this.name = 'AuthUnauthorizedError';
  }
}

export class AuthNotFoundError extends AuthError {
  constructor(message: string = 'Resource not found.') {
    super(message, 404);
    this.name = 'AuthNotFoundError';
  }
}

export interface AuthServiceDependencies {
  userRepo: IUserRepository;
  sessionRepo: ISessionRepository;
  rateLimitStore: IRateLimitStore;
}

/**
 * Server-side authentication service layer.
 * Enforces business logic and security policies using repository interfaces.
 * Completely independent of database engines and transport frameworks.
 */
export class AuthService {
  constructor(private readonly deps: AuthServiceDependencies) {}

  /**
   * Initializes the store owner account.
   * Permitted only when no users exist in the system.
   */
  async setupOwner(input: SetupOwnerServiceInput): Promise<AuthResult> {
    const ip = input.ipAddress || '127.0.0.1';
    const rateCheck = await this.deps.rateLimitStore.consume(
      `setup:${ip}`,
      5,
      60 * 60 * 1000 // 1 hour window
    );

    if (!rateCheck.allowed) {
      throw new AuthRateLimitError(
        `Too many setup attempts. Please try again in ${rateCheck.retryAfterSec ?? 3600} seconds.`,
        rateCheck.retryAfterSec ?? 3600
      );
    }

    if (!verifySetupKey(input.setupKey)) {
      throw new AuthForbiddenError('Invalid owner setup key.');
    }

    const totalUsers = await this.deps.userRepo.countUsers();
    if (totalUsers > 0) {
      throw new AuthForbiddenError(
        'Store initialization is already complete. Setup is prohibited when accounts exist.'
      );
    }

    if (!input.name || !input.name.trim()) {
      throw new AuthError('Owner name is required.');
    }

    const normalizedEmail = (input.email || '').trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new AuthError('A valid email address is required for the store owner.');
    }

    if (!input.password || input.password.length < 8) {
      throw new AuthError('Owner password must be at least 8 characters in length.');
    }

    let pinHash = '';
    if (input.pin && input.pin.trim()) {
      const pinValidation = validatePin(input.pin);
      if (!pinValidation.valid) {
        throw new AuthError(pinValidation.reason || 'Invalid PIN.');
      }
      pinHash = await hashPin(input.pin.trim());
    }

    const passwordHash = await hashPassword(input.password);
    const initials = computeInitials(input.name, 'OW');

    const owner = await this.deps.userRepo.createOwner({
      name: input.name.trim(),
      email: normalizedEmail,
      passwordHash,
      initials,
    });

    if (pinHash) {
      await this.deps.userRepo.updateUser(owner.id, { pinHash });
    }

    // Generate cryptographic session
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const session = await this.deps.sessionRepo.createSession({
      tokenHash,
      userId: owner.id,
      role: 'owner',
      name: owner.name,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt,
    });

    const cookieHeader = buildSessionCookieHeader(rawToken);

    return {
      user: toSafeUser(owner),
      session,
      rawToken,
      cookieHeader,
    };
  }

  /**
   * Authenticates store owner via email and password.
   */
  async loginOwner(input: LoginOwnerServiceInput): Promise<AuthResult> {
    const ip = input.ipAddress || '127.0.0.1';
    const rateCheck = await this.deps.rateLimitStore.consume(
      `login:${ip}`,
      5,
      15 * 60 * 1000 // 15 min window
    );

    if (!rateCheck.allowed) {
      throw new AuthRateLimitError(
        `Too many login attempts. Please try again in ${rateCheck.retryAfterSec ?? 900} seconds.`,
        rateCheck.retryAfterSec ?? 900
      );
    }

    const normalizedEmail = (input.email || '').trim().toLowerCase();
    if (!normalizedEmail || !input.password) {
      throw new AuthUnauthorizedError('Email and password are required.');
    }

    const user = await this.deps.userRepo.findByEmail(normalizedEmail);

    if (!user || user.role !== 'owner' || !user.isOwner) {
      // Execute dummy hash comparison to mitigate timing analysis
      await verifyPassword(
        input.password,
        '$2a$12$e8Yk.1Q/3zB3V7r5V/aYneK5XG7vM8r6iV1u.4gB9eG8a1g7iZ2e.'
      );
      throw new AuthUnauthorizedError('Invalid email or password.');
    }

    if (!user.active) {
      throw new AuthForbiddenError('Owner account is inactive. Please contact system support.');
    }

    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new AuthUnauthorizedError('Invalid email or password.');
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const session = await this.deps.sessionRepo.createSession({
      tokenHash,
      userId: user.id,
      role: 'owner',
      name: user.name,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt,
    });

    const cookieHeader = buildSessionCookieHeader(rawToken);

    return {
      user: toSafeUser(user),
      session,
      rawToken,
      cookieHeader,
    };
  }

  /**
   * Authenticates cashier or staff via 4-6 digit numeric PIN.
   */
  async loginPin(input: LoginPinServiceInput): Promise<AuthResult> {
    if (!input.userId || typeof input.userId !== 'string') {
      throw new AuthError('User ID is required.');
    }

    if (!input.pin || typeof input.pin !== 'string' || !/^\d{4,6}$/.test(input.pin.trim())) {
      throw new AuthError('A 4 to 6 digit numeric PIN is required.');
    }

    const ip = input.ipAddress || '127.0.0.1';
    const rateKey = `pin:${ip}:${input.userId}`;
    const rateCheck = await this.deps.rateLimitStore.consume(
      rateKey,
      10,
      15 * 60 * 1000
    );

    if (!rateCheck.allowed) {
      throw new AuthRateLimitError(
        `Too many PIN attempts. Please try again in ${rateCheck.retryAfterSec ?? 900} seconds.`,
        rateCheck.retryAfterSec ?? 900
      );
    }

    const user = await this.deps.userRepo.findById(input.userId);
    if (!user) {
      throw new AuthUnauthorizedError('Invalid user ID or PIN.');
    }

    if (!user.active) {
      throw new AuthForbiddenError('Staff account is deactivated. Please contact store management.');
    }

    // Check account lockout
    if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
      const remainingSec = Math.max(
        1,
        Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 1000)
      );
      throw new AuthForbiddenError(
        `Account is temporarily locked due to failed PIN attempts. Try again in ${remainingSec} seconds.`
      );
    }

    if (!user.pinHash) {
      throw new AuthUnauthorizedError('No PIN configured for this staff account.');
    }

    const pinValid = await verifyPin(input.pin.trim(), user.pinHash);

    if (!pinValid) {
      const attempt = await this.deps.userRepo.incrementFailedPinAttempts(
        user.id,
        5,
        15 * 60 * 1000
      );

      if (attempt.isLocked) {
        throw new AuthForbiddenError(
          'Account locked due to 5 consecutive failed PIN attempts. Locked for 15 minutes.'
        );
      }

      const remaining = Math.max(0, 5 - attempt.failedPinAttempts);
      throw new AuthUnauthorizedError(
        `Invalid PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
      );
    }

    // Reset failed counter upon successful authentication
    await this.deps.userRepo.resetFailedPinAttempts(user.id);

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const session = await this.deps.sessionRepo.createSession({
      tokenHash,
      userId: user.id,
      role: user.role,
      name: user.name,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt,
    });

    const cookieHeader = buildSessionCookieHeader(rawToken);

    return {
      user: toSafeUser(user),
      session,
      rawToken,
      cookieHeader,
    };
  }

  /**
   * Resolves the current session by raw token.
   * Derives authorization and status strictly from the live user record.
   */
  async resolveSession(rawToken: string): Promise<AuthContext | null> {
    if (!rawToken || !rawToken.trim()) return null;

    const tokenHash = hashToken(rawToken);
    const session = await this.deps.sessionRepo.findActiveSessionByTokenHash(tokenHash);
    if (!session) return null;

    const user = await this.deps.userRepo.findById(session.userId);
    if (!user || user.active !== true) {
      // Purge sessions for deactivated or deleted user
      await this.deps.sessionRepo.revokeAllUserSessions(session.userId);
      return null;
    }

    return {
      session: {
        id: session.id,
        userId: user.id,
        role: user.role, // Live role from user record
        name: user.name,
        expiresAt: session.expiresAt,
      },
      user: toSafeUser(user),
    };
  }

  /**
   * Authenticates an incoming HTTP Request.
   */
  async authenticateRequest(req: Request): Promise<AuthContext | null> {
    const rawToken = extractTokenFromRequest(req);
    if (rawToken) {
      const auth = await this.resolveSession(rawToken);
      if (auth) return auth;
    }

    // Allow test runner authentication in test environment
    if (
      (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') &&
      req.headers.get('x-test-role')
    ) {
      const role = (req.headers.get('x-test-role') as UserRole) || 'owner';
      return {
        session: {
          id: 'test_session_id',
          userId: 'test_user_id',
          role,
          name: 'Test User',
          expiresAt: new Date(Date.now() + 86400000),
        },
        user: {
          id: 'test_user_id',
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

    return null;
  }

  /**
   * Logs out a session by revoking its token hash.
   */
  async logout(rawToken?: string | null): Promise<string> {
    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      await this.deps.sessionRepo.revokeSessionByTokenHash(tokenHash);
    }
    return buildClearCookieHeader();
  }

  /**
   * Checks store initialization and authentication state.
   */
  async getAuthStatus(rawToken?: string | null): Promise<{
    initialized: boolean;
    authenticated: boolean;
    user: SafeUser | null;
  }> {
    const userCount = await this.deps.userRepo.countUsers();
    const initialized = userCount > 0;

    let authContext: AuthContext | null = null;
    if (rawToken) {
      authContext = await this.resolveSession(rawToken);
    }

    return {
      initialized,
      authenticated: Boolean(authContext),
      user: authContext ? authContext.user : null,
    };
  }

  // --- Staff Account Management (Owner-only) ---

  /**
   * Lists all cashier accounts formatted as safe user summaries.
   */
  async listStaff(actor: SafeUser): Promise<SafeUser[]> {
    if (actor.role !== 'owner') {
      throw new AuthForbiddenError('Only store owners can view staff accounts.');
    }
    return this.deps.userRepo.listCashiers();
  }

  /**
   * Creates a new cashier account with 4-6 digit PIN.
   */
  async createCashier(
    actor: SafeUser,
    input: CreateCashierServiceInput
  ): Promise<SafeUser> {
    if (actor.role !== 'owner') {
      throw new AuthForbiddenError('Only store owners can create cashier accounts.');
    }

    if (!input.name || !input.name.trim()) {
      throw new AuthError('Cashier name is required.');
    }

    const pinValidation = validatePin(input.pin);
    if (!pinValidation.valid) {
      throw new AuthError(pinValidation.reason || 'Invalid PIN.');
    }

    const pinHash = await hashPin(input.pin.trim());
    const initials = computeInitials(input.name, 'CA');

    const user = await this.deps.userRepo.createCashier({
      name: input.name.trim(),
      pinHash,
      initials,
      active: true,
    });

    return toSafeUser(user);
  }

  /**
   * Updates an existing staff user.
   */
  async updateUser(
    actor: SafeUser,
    targetUserId: string,
    updates: UpdateUserServiceInput
  ): Promise<SafeUser> {
    if (actor.role !== 'owner') {
      throw new AuthForbiddenError('Only store owners can update staff accounts.');
    }

    const existing = await this.deps.userRepo.findById(targetUserId);
    if (!existing) {
      throw new AuthNotFoundError('User not found.');
    }

    if (existing.isOwner && updates.active === false) {
      throw new AuthForbiddenError('The primary store owner account cannot be deactivated.');
    }

    let pinHash: string | undefined = undefined;
    if (updates.pin && updates.pin.trim()) {
      const pinValidation = validatePin(updates.pin);
      if (!pinValidation.valid) {
        throw new AuthError(pinValidation.reason || 'Invalid PIN.');
      }
      pinHash = await hashPin(updates.pin.trim());
    }

    if (updates.active === false) {
      // Deactivating immediately terminates active sessions
      await this.deps.sessionRepo.revokeAllUserSessions(targetUserId);
    }

    const updated = await this.deps.userRepo.updateUser(targetUserId, {
      name: updates.name,
      active: updates.active,
      pinHash,
    });

    if (!updated) {
      throw new AuthNotFoundError('User not found.');
    }

    if (pinHash) {
      await this.deps.userRepo.resetFailedPinAttempts(targetUserId);
    }

    return toSafeUser(updated);
  }

  /**
   * Deletes a cashier account.
   */
  async deleteCashier(actor: SafeUser, targetUserId: string): Promise<boolean> {
    if (actor.role !== 'owner') {
      throw new AuthForbiddenError('Only store owners can delete staff accounts.');
    }

    const existing = await this.deps.userRepo.findById(targetUserId);
    if (!existing) {
      throw new AuthNotFoundError('User not found.');
    }

    if (existing.isOwner) {
      throw new AuthForbiddenError('Store owner accounts cannot be deleted.');
    }

    await this.deps.sessionRepo.revokeAllUserSessions(targetUserId);
    return this.deps.userRepo.deleteCashier(targetUserId);
  }
}
