import mongoose from 'mongoose';
import User from '../src/models/User';
import Session from '../src/models/Session';
import RateLimit from '../src/models/RateLimit';
import { connectDB } from '../src/lib/mongodb';

export interface PreflightCheckResult {
  id: string;
  category: 'INDEX' | 'DATA';
  name: string;
  status: 'PASS' | 'FAIL' | 'NEEDS ATTENTION';
  details: string;
  conflictingIds?: string[];
}

export interface PreflightReport {
  timestamp: string;
  overallStatus: 'PASS' | 'FAIL' | 'NEEDS ATTENTION';
  indexChecks: PreflightCheckResult[];
  dataChecks: PreflightCheckResult[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    needsAttention: number;
  };
}

export interface MongoRawIndex {
  name?: string;
  key?: Record<string, number | string>;
  unique?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: Record<string, unknown>;
}

/**
 * Normalizes an email for comparison matching the AuthService normalization.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Strictly read-only index verification for a collection.
 * Compares live collection indexes against required specifications without mutating anything.
 */
export async function inspectCollectionIndexes(
  db: mongoose.mongo.Db,
  collectionName: string
): Promise<MongoRawIndex[]> {
  try {
    const coll = db.collection(collectionName);
    return (await coll.indexes()) as MongoRawIndex[];
  } catch (err: unknown) {
    const msg = String(err).toLowerCase();
    if (msg.includes('ns not found') || msg.includes('does not exist')) {
      return [];
    }
    throw err;
  }
}

/**
 * Selects candidate indexes from a list matching an exact single-key pattern.
 * Prevents compound indexes from falsely matching a single-field index.
 */
export function findIndexesMatchingKey(
  indexes: MongoRawIndex[],
  keyPattern: Record<string, number | string>
): MongoRawIndex[] {
  const targetEntries = Object.entries(keyPattern);
  return indexes.filter((idx) => {
    if (!idx.key) return false;
    const idxEntries = Object.entries(idx.key);
    if (idxEntries.length !== targetEntries.length) return false;
    return targetEntries.every(([k, v]) => idx.key?.[k] === v);
  });
}

/**
 * Validates partialFilterExpression for users.{ email: 1 } in an order-independent manner.
 * Must match: { email: { $type: "string", $gt: "" } }
 */
export function isValidEmailPartialFilter(expr: unknown): boolean {
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    return false;
  }
  const keys = Object.keys(expr);
  if (keys.length !== 1 || keys[0] !== 'email') {
    return false;
  }
  const emailExpr = (expr as Record<string, unknown>).email;
  if (typeof emailExpr !== 'object' || emailExpr === null || Array.isArray(emailExpr)) {
    return false;
  }
  const emailKeys = Object.keys(emailExpr);
  if (emailKeys.length !== 2) {
    return false;
  }
  const rec = emailExpr as Record<string, unknown>;
  return rec.$type === 'string' && rec.$gt === '';
}

/**
 * Validates partialFilterExpression for users.{ isOwner: 1 } in an order-independent manner.
 * Must match: { isOwner: true }
 */
export function isValidOwnerPartialFilter(expr: unknown): boolean {
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    return false;
  }
  const keys = Object.keys(expr);
  if (keys.length !== 1 || keys[0] !== 'isOwner') {
    return false;
  }
  return (expr as Record<string, unknown>).isOwner === true;
}

/**
 * Verifies the 7 required authentication indexes against the database catalog.
 */
export async function runAuthIndexInspection(
  db: mongoose.mongo.Db
): Promise<PreflightCheckResult[]> {
  const results: PreflightCheckResult[] = [];

  const [userIndexes, sessionIndexes, rateLimitIndexes] = await Promise.all([
    inspectCollectionIndexes(db, 'users'),
    inspectCollectionIndexes(db, 'sessions'),
    inspectCollectionIndexes(db, 'ratelimits'),
  ]);

  // 1. users: { isOwner: 1 } (unique partial)
  const matchingOwnerIndexes = findIndexesMatchingKey(userIndexes, { isOwner: 1 });
  if (matchingOwnerIndexes.length === 0) {
    results.push({
      id: 'IDX_USER_OWNER',
      category: 'INDEX',
      name: 'users.{ isOwner: 1 } Unique Partial Index',
      status: 'NEEDS ATTENTION',
      details:
        'Missing in database catalog. Declared in User.ts schema; must be built before production owner registration.',
    });
  } else if (matchingOwnerIndexes.length > 1) {
    results.push({
      id: 'IDX_USER_OWNER',
      category: 'INDEX',
      name: 'users.{ isOwner: 1 } Unique Partial Index',
      status: 'FAIL',
      details: `Ambiguous candidate indexes detected: found ${matchingOwnerIndexes.length} indexes matching key { isOwner: 1 }.`,
    });
  } else {
    const isOwnerIndex = matchingOwnerIndexes[0];
    const hasValidFilter = isValidOwnerPartialFilter(isOwnerIndex.partialFilterExpression);
    if (!isOwnerIndex.unique || !hasValidFilter) {
      results.push({
        id: 'IDX_USER_OWNER',
        category: 'INDEX',
        name: 'users.{ isOwner: 1 } Unique Partial Index',
        status: 'FAIL',
        details: !isOwnerIndex.unique
          ? 'Index exists but is missing unique: true constraint.'
          : 'Index exists but options mismatch: must have partialFilterExpression: { isOwner: true }.',
      });
    } else {
      results.push({
        id: 'IDX_USER_OWNER',
        category: 'INDEX',
        name: 'users.{ isOwner: 1 } Unique Partial Index',
        status: 'PASS',
        details: 'Verified in database catalog with correct unique partial filter.',
      });
    }
  }

  // 2. users: { email: 1 } (unique partial)
  const matchingEmailIndexes = findIndexesMatchingKey(userIndexes, { email: 1 });
  if (matchingEmailIndexes.length === 0) {
    results.push({
      id: 'IDX_USER_EMAIL',
      category: 'INDEX',
      name: 'users.{ email: 1 } Unique Partial Index',
      status: 'NEEDS ATTENTION',
      details:
        'Missing in database catalog. Declared in User.ts schema; required for unique email constraint.',
    });
  } else if (matchingEmailIndexes.length > 1) {
    results.push({
      id: 'IDX_USER_EMAIL',
      category: 'INDEX',
      name: 'users.{ email: 1 } Unique Partial Index',
      status: 'FAIL',
      details: `Ambiguous candidate indexes detected: found ${matchingEmailIndexes.length} indexes matching key { email: 1 }.`,
    });
  } else {
    const emailIndex = matchingEmailIndexes[0];
    const hasValidFilter = isValidEmailPartialFilter(emailIndex.partialFilterExpression);
    if (!emailIndex.unique || !hasValidFilter) {
      results.push({
        id: 'IDX_USER_EMAIL',
        category: 'INDEX',
        name: 'users.{ email: 1 } Unique Partial Index',
        status: 'FAIL',
        details: !emailIndex.unique
          ? 'Index exists on email but is missing unique: true constraint.'
          : 'Index exists on email but partialFilterExpression must be { email: { $type: "string", $gt: "" } }.',
      });
    } else {
      results.push({
        id: 'IDX_USER_EMAIL',
        category: 'INDEX',
        name: 'users.{ email: 1 } Unique Partial Index',
        status: 'PASS',
        details: 'Verified in database catalog with unique partial constraint.',
      });
    }
  }

  // 3. sessions: { tokenHash: 1 } (unique)
  const matchingTokenIndexes = findIndexesMatchingKey(sessionIndexes, { tokenHash: 1 });
  if (matchingTokenIndexes.length === 0) {
    results.push({
      id: 'IDX_SESSION_TOKEN',
      category: 'INDEX',
      name: 'sessions.{ tokenHash: 1 } Unique Index',
      status: 'NEEDS ATTENTION',
      details:
        'Missing in database catalog. Declared in Session.ts schema; required to prevent duplicate session tokens.',
    });
  } else if (matchingTokenIndexes.length > 1) {
    results.push({
      id: 'IDX_SESSION_TOKEN',
      category: 'INDEX',
      name: 'sessions.{ tokenHash: 1 } Unique Index',
      status: 'FAIL',
      details: `Ambiguous candidate indexes detected: found ${matchingTokenIndexes.length} indexes matching key { tokenHash: 1 }.`,
    });
  } else if (!matchingTokenIndexes[0].unique) {
    results.push({
      id: 'IDX_SESSION_TOKEN',
      category: 'INDEX',
      name: 'sessions.{ tokenHash: 1 } Unique Index',
      status: 'FAIL',
      details: 'Index exists on tokenHash but is missing unique: true constraint.',
    });
  } else {
    results.push({
      id: 'IDX_SESSION_TOKEN',
      category: 'INDEX',
      name: 'sessions.{ tokenHash: 1 } Unique Index',
      status: 'PASS',
      details: 'Verified in database catalog with unique: true constraint.',
    });
  }

  // 4. sessions: { expiresAt: 1 } (TTL: 0s)
  const matchingSessionTtlIndexes = findIndexesMatchingKey(sessionIndexes, { expiresAt: 1 });
  if (matchingSessionTtlIndexes.length === 0) {
    results.push({
      id: 'IDX_SESSION_TTL',
      category: 'INDEX',
      name: 'sessions.{ expiresAt: 1 } TTL Index',
      status: 'NEEDS ATTENTION',
      details:
        'Missing in database catalog. Declared in Session.ts schema; required for automatic session cleanup.',
    });
  } else if (matchingSessionTtlIndexes.length > 1) {
    results.push({
      id: 'IDX_SESSION_TTL',
      category: 'INDEX',
      name: 'sessions.{ expiresAt: 1 } TTL Index',
      status: 'FAIL',
      details: `Ambiguous candidate indexes detected: found ${matchingSessionTtlIndexes.length} indexes matching key { expiresAt: 1 }.`,
    });
  } else if (matchingSessionTtlIndexes[0].expireAfterSeconds !== 0) {
    results.push({
      id: 'IDX_SESSION_TTL',
      category: 'INDEX',
      name: 'sessions.{ expiresAt: 1 } TTL Index',
      status: 'FAIL',
      details:
        matchingSessionTtlIndexes[0].expireAfterSeconds === undefined
          ? 'Index exists on expiresAt but is missing expireAfterSeconds TTL option.'
          : `TTL index exists but expireAfterSeconds is ${matchingSessionTtlIndexes[0].expireAfterSeconds} instead of 0.`,
    });
  } else {
    results.push({
      id: 'IDX_SESSION_TTL',
      category: 'INDEX',
      name: 'sessions.{ expiresAt: 1 } TTL Index',
      status: 'PASS',
      details: 'Verified in database catalog with expireAfterSeconds: 0.',
    });
  }

  // 5. sessions: { userId: 1 } (Standard index)
  const matchingSessionUserIndexes = findIndexesMatchingKey(sessionIndexes, { userId: 1 });
  if (matchingSessionUserIndexes.length === 0) {
    results.push({
      id: 'IDX_SESSION_USERID',
      category: 'INDEX',
      name: 'sessions.{ userId: 1 } Index',
      status: 'NEEDS ATTENTION',
      details:
        'Missing in database catalog. Declared in Session.ts schema; needed for fast revocation of user sessions.',
    });
  } else if (matchingSessionUserIndexes.length > 1) {
    results.push({
      id: 'IDX_SESSION_USERID',
      category: 'INDEX',
      name: 'sessions.{ userId: 1 } Index',
      status: 'FAIL',
      details: `Ambiguous candidate indexes detected: found ${matchingSessionUserIndexes.length} indexes matching key { userId: 1 }.`,
    });
  } else {
    results.push({
      id: 'IDX_SESSION_USERID',
      category: 'INDEX',
      name: 'sessions.{ userId: 1 } Index',
      status: 'PASS',
      details: 'Verified in database catalog.',
    });
  }

  // 6. ratelimits: { key: 1 } (unique)
  const matchingRateLimitKeyIndexes = findIndexesMatchingKey(rateLimitIndexes, { key: 1 });
  if (matchingRateLimitKeyIndexes.length === 0) {
    results.push({
      id: 'IDX_RATELIMIT_KEY',
      category: 'INDEX',
      name: 'ratelimits.{ key: 1 } Unique Index',
      status: 'NEEDS ATTENTION',
      details:
        'Missing in database catalog. Declared in RateLimit.ts schema; required for atomic rate limit upsert locks.',
    });
  } else if (matchingRateLimitKeyIndexes.length > 1) {
    results.push({
      id: 'IDX_RATELIMIT_KEY',
      category: 'INDEX',
      name: 'ratelimits.{ key: 1 } Unique Index',
      status: 'FAIL',
      details: `Ambiguous candidate indexes detected: found ${matchingRateLimitKeyIndexes.length} indexes matching key { key: 1 }.`,
    });
  } else if (!matchingRateLimitKeyIndexes[0].unique) {
    results.push({
      id: 'IDX_RATELIMIT_KEY',
      category: 'INDEX',
      name: 'ratelimits.{ key: 1 } Unique Index',
      status: 'FAIL',
      details: 'Index exists on key but is missing unique: true constraint.',
    });
  } else {
    results.push({
      id: 'IDX_RATELIMIT_KEY',
      category: 'INDEX',
      name: 'ratelimits.{ key: 1 } Unique Index',
      status: 'PASS',
      details: 'Verified in database catalog with unique: true constraint.',
    });
  }

  // 7. ratelimits: { expiresAt: 1 } (TTL: 0s)
  const matchingRateLimitTtlIndexes = findIndexesMatchingKey(rateLimitIndexes, { expiresAt: 1 });
  if (matchingRateLimitTtlIndexes.length === 0) {
    results.push({
      id: 'IDX_RATELIMIT_TTL',
      category: 'INDEX',
      name: 'ratelimits.{ expiresAt: 1 } TTL Index',
      status: 'NEEDS ATTENTION',
      details:
        'Missing in database catalog. Declared in RateLimit.ts schema; required for sliding window garbage collection.',
    });
  } else if (matchingRateLimitTtlIndexes.length > 1) {
    results.push({
      id: 'IDX_RATELIMIT_TTL',
      category: 'INDEX',
      name: 'ratelimits.{ expiresAt: 1 } TTL Index',
      status: 'FAIL',
      details: `Ambiguous candidate indexes detected: found ${matchingRateLimitTtlIndexes.length} indexes matching key { expiresAt: 1 }.`,
    });
  } else if (matchingRateLimitTtlIndexes[0].expireAfterSeconds !== 0) {
    results.push({
      id: 'IDX_RATELIMIT_TTL',
      category: 'INDEX',
      name: 'ratelimits.{ expiresAt: 1 } TTL Index',
      status: 'FAIL',
      details:
        matchingRateLimitTtlIndexes[0].expireAfterSeconds === undefined
          ? 'Index exists on expiresAt but is missing expireAfterSeconds TTL option.'
          : `TTL index exists but expireAfterSeconds is ${matchingRateLimitTtlIndexes[0].expireAfterSeconds} instead of 0.`,
    });
  } else {
    results.push({
      id: 'IDX_RATELIMIT_TTL',
      category: 'INDEX',
      name: 'ratelimits.{ expiresAt: 1 } TTL Index',
      status: 'PASS',
      details: 'Verified in database catalog with expireAfterSeconds: 0.',
    });
  }

  return results;
}

/**
 * Strictly read-only data preflight validation.
 * Prohibits any update/write/delete operations; uses projections to never leak credentials.
 */
export async function runAuthDataInspection(): Promise<PreflightCheckResult[]> {
  const results: PreflightCheckResult[] = [];

  // --- 1. Multiple Owners Check ---
  const owners = await User.find(
    { isOwner: true },
    { _id: 1, name: 1, role: 1 }
  ).lean();

  if (owners.length > 1) {
    results.push({
      id: 'DATA_MULTIPLE_OWNERS',
      category: 'DATA',
      name: 'Single Store Owner Constraint',
      status: 'FAIL',
      details: `Detected ${owners.length} records with isOwner: true. Unique partial index creation will fail until duplicates are remediated.`,
      conflictingIds: owners.map((o) => String(o._id)),
    });
  } else if (owners.length === 1) {
    results.push({
      id: 'DATA_MULTIPLE_OWNERS',
      category: 'DATA',
      name: 'Single Store Owner Constraint',
      status: 'PASS',
      details: `Exactly 1 store owner detected (ID: ${owners[0]._id}).`,
    });
  } else {
    results.push({
      id: 'DATA_MULTIPLE_OWNERS',
      category: 'DATA',
      name: 'Single Store Owner Constraint',
      status: 'PASS',
      details: 'Zero store owners registered (clean state ready for initial owner setup).',
    });
  }

  // --- 2. Owner Consistency Check (role vs isOwner) ---
  const inconsistentUsers = await User.find(
    {
      $or: [
        { role: 'owner', isOwner: { $ne: true } },
        { isOwner: true, role: { $ne: 'owner' } },
      ],
    },
    { _id: 1, name: 1, role: 1, isOwner: 1 }
  ).lean();

  if (inconsistentUsers.length > 0) {
    results.push({
      id: 'DATA_OWNER_ROLE_MISMATCH',
      category: 'DATA',
      name: 'Owner Role and isOwner Flag Consistency',
      status: 'FAIL',
      details: `Found ${inconsistentUsers.length} user records with role/isOwner mismatch.`,
      conflictingIds: inconsistentUsers.map((u) => String(u._id)),
    });
  } else {
    results.push({
      id: 'DATA_OWNER_ROLE_MISMATCH',
      category: 'DATA',
      name: 'Owner Role and isOwner Flag Consistency',
      status: 'PASS',
      details: 'All user records have consistent role and isOwner states.',
    });
  }

  // --- 3. Duplicate Email Check (Raw and Normalized) ---
  const normalizedEmailDuplicates = await User.aggregate<{
    _id: string;
    count: number;
    ids: mongoose.Types.ObjectId[];
  }>([
    { $match: { email: { $type: 'string', $gt: '' } } },
    {
      $group: {
        _id: { $toLower: { $trim: { input: '$email' } } },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (normalizedEmailDuplicates.length > 0) {
    const allCollidingIds = normalizedEmailDuplicates.flatMap((g) =>
      g.ids.map(String)
    );
    results.push({
      id: 'DATA_DUPLICATE_EMAILS',
      category: 'DATA',
      name: 'Email Address Uniqueness (Normalized)',
      status: 'FAIL',
      details: `Found ${normalizedEmailDuplicates.length} collision groups containing duplicate normalized emails.`,
      conflictingIds: allCollidingIds,
    });
  } else {
    results.push({
      id: 'DATA_DUPLICATE_EMAILS',
      category: 'DATA',
      name: 'Email Address Uniqueness (Normalized)',
      status: 'PASS',
      details: 'All non-empty user email addresses are unique after normalization.',
    });
  }

  // --- 4. Duplicate Session Token Hashes ---
  const duplicateSessions = await Session.aggregate<{
    _id: string;
    count: number;
    ids: mongoose.Types.ObjectId[];
  }>([
    { $match: { tokenHash: { $type: 'string', $gt: '' } } },
    {
      $group: {
        _id: '$tokenHash',
        count: { $sum: 1 },
        ids: { $push: '$_id' },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (duplicateSessions.length > 0) {
    results.push({
      id: 'DATA_DUPLICATE_SESSIONS',
      category: 'DATA',
      name: 'Session Token Hash Uniqueness',
      status: 'FAIL',
      details: `Found ${duplicateSessions.length} groups of duplicate session token hashes.`,
      conflictingIds: duplicateSessions.flatMap((g) => g.ids.map(String)),
    });
  } else {
    results.push({
      id: 'DATA_DUPLICATE_SESSIONS',
      category: 'DATA',
      name: 'Session Token Hash Uniqueness',
      status: 'PASS',
      details: 'All session token hashes are unique.',
    });
  }

  // --- 5. Duplicate Rate Limit Keys ---
  const duplicateRateLimits = await RateLimit.aggregate<{
    _id: string;
    count: number;
    ids: mongoose.Types.ObjectId[];
  }>([
    { $match: { key: { $type: 'string', $gt: '' } } },
    {
      $group: {
        _id: '$key',
        count: { $sum: 1 },
        ids: { $push: '$_id' },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (duplicateRateLimits.length > 0) {
    results.push({
      id: 'DATA_DUPLICATE_RATELIMITS',
      category: 'DATA',
      name: 'Rate Limit Key Uniqueness',
      status: 'FAIL',
      details: `Found ${duplicateRateLimits.length} duplicate rate limit keys.`,
      conflictingIds: duplicateRateLimits.flatMap((g) => g.ids.map(String)),
    });
  } else {
    results.push({
      id: 'DATA_DUPLICATE_RATELIMITS',
      category: 'DATA',
      name: 'Rate Limit Key Uniqueness',
      status: 'PASS',
      details: 'All rate limit keys are unique.',
    });
  }

  // --- 6. Malformed Session Records Check ---
  const malformedSessions = await Session.find(
    {
      $or: [
        { tokenHash: { $exists: false } },
        { tokenHash: null },
        { tokenHash: '' },
        { userId: { $exists: false } },
        { userId: null },
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $not: { $type: 'date' } } },
      ],
    },
    { _id: 1 }
  ).lean();

  if (malformedSessions.length > 0) {
    results.push({
      id: 'DATA_MALFORMED_SESSIONS',
      category: 'DATA',
      name: 'Session Schema Field Validity',
      status: 'FAIL',
      details: `Found ${malformedSessions.length} session records with missing or invalid tokenHash, userId, or expiresAt.`,
      conflictingIds: malformedSessions.map((s) => String(s._id)),
    });
  } else {
    results.push({
      id: 'DATA_MALFORMED_SESSIONS',
      category: 'DATA',
      name: 'Session Schema Field Validity',
      status: 'PASS',
      details: 'All session records contain valid tokenHash, userId, and expiresAt fields.',
    });
  }

  // --- 7. Malformed Rate Limit Records Check ---
  const malformedRateLimits = await RateLimit.find(
    {
      $or: [
        { key: { $exists: false } },
        { key: null },
        { key: '' },
        { count: { $exists: false } },
        { count: null },
        { count: { $lt: 1 } },
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $not: { $type: 'date' } } },
      ],
    },
    { _id: 1 }
  ).lean();

  if (malformedRateLimits.length > 0) {
    results.push({
      id: 'DATA_MALFORMED_RATELIMITS',
      category: 'DATA',
      name: 'Rate Limit Schema Field Validity',
      status: 'FAIL',
      details: `Found ${malformedRateLimits.length} rate limit documents with invalid key, count, or expiresAt.`,
      conflictingIds: malformedRateLimits.map((r) => String(r._id)),
    });
  } else {
    results.push({
      id: 'DATA_MALFORMED_RATELIMITS',
      category: 'DATA',
      name: 'Rate Limit Schema Field Validity',
      status: 'PASS',
      details: 'All rate limit records contain valid key, count, and expiresAt fields.',
    });
  }

  return results;
}

/**
 * Executes the complete preflight audit.
 * Connects lazily and executes read-only inspections.
 * Does NOT disconnect Mongoose so programmatic callers and tests maintain their connection lifecycle.
 */
export async function runAuthPreflight(): Promise<PreflightReport> {
  const conn = await connectDB();
  const db = conn.connection.db;

  if (!db) {
    throw new Error('Database handle is unavailable from connection.');
  }

  const indexChecks = await runAuthIndexInspection(db);
  const dataChecks = await runAuthDataInspection();

  const allChecks = [...indexChecks, ...dataChecks];
  const failed = allChecks.filter((c) => c.status === 'FAIL').length;
  const needsAttention = allChecks.filter((c) => c.status === 'NEEDS ATTENTION').length;
  const passed = allChecks.filter((c) => c.status === 'PASS').length;

  let overallStatus: 'PASS' | 'FAIL' | 'NEEDS ATTENTION' = 'PASS';
  if (failed > 0) {
    overallStatus = 'FAIL';
  } else if (needsAttention > 0) {
    overallStatus = 'NEEDS ATTENTION';
  }

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    indexChecks,
    dataChecks,
    summary: {
      totalChecks: allChecks.length,
      passed,
      failed,
      needsAttention,
    },
  };
}

/**
 * Formats a PreflightReport into a clean human-readable console output.
 */
export function formatPreflightReport(report: PreflightReport): string {
  const lines: string[] = [];
  lines.push('================================================================');
  lines.push('       NEXORA POS — AUTHENTICATION DATABASE PREFLIGHT REPORT    ');
  lines.push('================================================================');
  lines.push(`Timestamp:      ${report.timestamp}`);
  lines.push(`Overall Status: [${report.overallStatus}]`);
  lines.push(`Checks Passed:  ${report.summary.passed}/${report.summary.totalChecks}`);
  if (report.summary.failed > 0) {
    lines.push(`Checks Failed:  ${report.summary.failed}`);
  }
  if (report.summary.needsAttention > 0) {
    lines.push(`Needs Attention:${report.summary.needsAttention}`);
  }
  lines.push('----------------------------------------------------------------');
  lines.push('1. INDEX INSPECTION CHECKS:');
  for (const c of report.indexChecks) {
    lines.push(`  [${c.status}] ${c.name}`);
    lines.push(`         ${c.details}`);
  }
  lines.push('----------------------------------------------------------------');
  lines.push('2. DATA INTEGRITY CHECKS:');
  for (const c of report.dataChecks) {
    lines.push(`  [${c.status}] ${c.name}`);
    lines.push(`         ${c.details}`);
    if (c.conflictingIds && c.conflictingIds.length > 0) {
      lines.push(`         Conflicting IDs: ${c.conflictingIds.slice(0, 10).join(', ')}${c.conflictingIds.length > 10 ? ' ...' : ''}`);
    }
  }
  lines.push('================================================================');
  return lines.join('\n');
}

/**
 * Determines whether this script is being executed directly via CLI.
 */
export function isDirectlyExecuted(argv: string[] = process.argv): boolean {
  return (
    typeof process !== 'undefined' &&
    Boolean(argv && argv[1]) &&
    (argv[1].endsWith('auth-preflight.ts') ||
      argv[1].endsWith('auth-preflight.js') ||
      argv[1].endsWith('auth-preflight'))
  );
}

/**
 * Standalone CLI execution coordinator. Owns connection cleanup so programmatic callers
 * are never affected by teardown of the shared Mongoose instance.
 */
export async function runCli(): Promise<void> {
  let preflightError: unknown = null;
  try {
    const report = await runAuthPreflight();
    console.log(formatPreflightReport(report));
    if (report.overallStatus === 'FAIL') {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (err: unknown) {
    preflightError = err;
    console.error(
      'Preflight Error:',
      err instanceof Error ? err.message : String(err)
    );
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch (disconnectErr: unknown) {
      console.error(
        'Database disconnect error during CLI cleanup:',
        disconnectErr instanceof Error ? disconnectErr.message : String(disconnectErr)
      );
      process.exitCode = 1;
    }
    if (preflightError !== null) {
      process.exitCode = 1;
    }
  }
}

if (isDirectlyExecuted()) {
  void runCli();
}
