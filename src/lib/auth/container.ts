import { AuthService, type AuthServiceDependencies } from './service';
import {
  MongoUserRepository,
  MongoSessionRepository,
  MongoRateLimitStore,
} from './mongo-repositories';

export class AuthConfigurationError extends Error {
  constructor(
    message: string = 'Production authentication repository is not configured.'
  ) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

let activeDependencies: AuthServiceDependencies | null = null;
let defaultMongoDependencies: AuthServiceDependencies | null = null;

/**
 * Explicitly injects authentication repository dependencies.
 * Used by unit tests to inject in-memory repositories or test doubles.
 * Calling setAuthRepositories(null) clears dependencies.
 */
export function setAuthRepositories(deps: AuthServiceDependencies | null): void {
  activeDependencies = deps;
}

/**
 * Returns whether an authentication repository provider is currently registered.
 */
export function isAuthServiceConfigured(): boolean {
  if (activeDependencies !== null) return true;
  // In test environments, repositories are not considered configured unless explicitly injected
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return false;
  }
  return true;
}

/**
 * Lazily resolves the singleton production MongoDB repository dependencies.
 * Instantiation creates repository adapter classes without establishing network connections;
 * database connectivity is initiated lazily via connectDB() during operation execution.
 */
export function getOrCreateMongoRepositories(): AuthServiceDependencies {
  if (!defaultMongoDependencies) {
    defaultMongoDependencies = {
      userRepo: new MongoUserRepository(),
      sessionRepo: new MongoSessionRepository(),
      rateLimitStore: new MongoRateLimitStore(),
    };
  }
  return defaultMongoDependencies;
}

/**
 * Resolves the active AuthService instance.
 *
 * In tests: Requires explicit injection via setAuthRepositories(...) to prevent
 * accidental database calls or test state pollution. Fails closed with AuthConfigurationError.
 *
 * In production/runtime: Lazily utilizes the MongoUserRepository,
 * MongoSessionRepository, and MongoRateLimitStore.
 *
 * FAILS CLOSED: Never silently substitutes an in-memory repository when unconfigured.
 */
export function getAuthService(): AuthService {
  if (activeDependencies) {
    return new AuthService(activeDependencies);
  }

  // Unit test harness check: fail closed unless explicitly injected
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    throw new AuthConfigurationError(
      'Authentication repository is not configured. MongoDB database adapter must be integrated in Stage 3.'
    );
  }

  // Production runtime resolution
  const mongoDeps = getOrCreateMongoRepositories();
  return new AuthService(mongoDeps);
}
