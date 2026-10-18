import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import User from '@/models/User';
import Session from '@/models/Session';
import RateLimit from '@/models/RateLimit';
import * as mongodb from '@/lib/mongodb';
import {
  runAuthIndexInspection,
  runAuthDataInspection,
  runAuthPreflight,
  formatPreflightReport,
  normalizeEmail,
  findIndexesMatchingKey,
  isValidEmailPartialFilter,
  isValidOwnerPartialFilter,
  isDirectlyExecuted,
  runCli,
  type MongoRawIndex,
} from '../../scripts/auth-preflight';

describe('Authentication Database Preflight (Stage 4B.4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Read-Only Safety Guarantee and Connection Lifecycle', () => {
    it('performs zero writes, updates, deletions, or index creations during execution', async () => {
      // Mock connection
      const fakeDb = {
        collection: vi.fn().mockReturnValue({
          indexes: vi.fn().mockResolvedValue([
            { key: { _id: 1 } },
          ]),
          createIndex: vi.fn(),
          dropIndex: vi.fn(),
        }),
      } as unknown as mongoose.mongo.Db;

      vi.spyOn(mongodb, 'connectDB').mockResolvedValue({
        connection: { db: fakeDb },
      } as unknown as typeof mongoose);

      // Spy on all write operations across models
      const userCreateSpy = vi.spyOn(User, 'create').mockImplementation(() => {
        throw new Error('Write operation prohibited!');
      });
      const userUpdateSpy = vi.spyOn(User, 'updateOne').mockImplementation(() => {
        throw new Error('Write operation prohibited!');
      });
      const userDeleteSpy = vi.spyOn(User, 'deleteOne').mockImplementation(() => {
        throw new Error('Write operation prohibited!');
      });
      const sessionCreateSpy = vi.spyOn(Session, 'create').mockImplementation(() => {
        throw new Error('Write operation prohibited!');
      });
      const rateLimitCreateSpy = vi.spyOn(RateLimit, 'create').mockImplementation(() => {
        throw new Error('Write operation prohibited!');
      });

      // Mock query reads
      vi.spyOn(User, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof User.find>);
      vi.spyOn(User, 'aggregate').mockResolvedValue([]);
      vi.spyOn(Session, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof Session.find>);
      vi.spyOn(Session, 'aggregate').mockResolvedValue([]);
      vi.spyOn(RateLimit, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof RateLimit.find>);
      vi.spyOn(RateLimit, 'aggregate').mockResolvedValue([]);

      const report = await runAuthPreflight();

      // Assert read-only guarantee
      expect(userCreateSpy).not.toHaveBeenCalled();
      expect(userUpdateSpy).not.toHaveBeenCalled();
      expect(userDeleteSpy).not.toHaveBeenCalled();
      expect(sessionCreateSpy).not.toHaveBeenCalled();
      expect(rateLimitCreateSpy).not.toHaveBeenCalled();
      expect(fakeDb.collection('users').createIndex).not.toHaveBeenCalled();
      expect(fakeDb.collection('users').dropIndex).not.toHaveBeenCalled();

      expect(report.overallStatus).toBeDefined();
    });

    it('does not invoke global mongoose.disconnect() when runAuthPreflight() is called', async () => {
      const disconnectSpy = vi.spyOn(mongoose, 'disconnect').mockResolvedValue();

      const fakeDb = {
        collection: vi.fn().mockReturnValue({
          indexes: vi.fn().mockResolvedValue([{ key: { _id: 1 } }]),
        }),
      } as unknown as mongoose.mongo.Db;

      vi.spyOn(mongodb, 'connectDB').mockResolvedValue({
        connection: { db: fakeDb },
      } as unknown as typeof mongoose);

      vi.spyOn(User, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof User.find>);
      vi.spyOn(User, 'aggregate').mockResolvedValue([]);
      vi.spyOn(Session, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof Session.find>);
      vi.spyOn(Session, 'aggregate').mockResolvedValue([]);
      vi.spyOn(RateLimit, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof RateLimit.find>);
      vi.spyOn(RateLimit, 'aggregate').mockResolvedValue([]);

      await runAuthPreflight();

      // Preflight function MUST NOT disconnect Mongoose singleton
      expect(disconnectSpy).not.toHaveBeenCalled();
    });

    it('does not invoke global mongoose.disconnect() even if preflight queries fail', async () => {
      const disconnectSpy = vi.spyOn(mongoose, 'disconnect').mockResolvedValue();

      vi.spyOn(mongodb, 'connectDB').mockResolvedValue({
        connection: {
          db: {
            collection: vi.fn().mockImplementation(() => {
              throw new Error('Simulated network failure');
            }),
          },
        },
      } as unknown as typeof mongoose);

      await expect(runAuthPreflight()).rejects.toThrow('Simulated network failure');
      expect(disconnectSpy).not.toHaveBeenCalled();
    });
  });

  describe('CLI Direct-Execution and Connection Lifecycle', () => {
    it('correctly distinguishes direct script invocation from module import', () => {
      expect(isDirectlyExecuted(['node', '/app/scripts/auth-preflight.ts'])).toBe(true);
      expect(isDirectlyExecuted(['node', 'C:\\nexora\\scripts\\auth-preflight.ts'])).toBe(true);
      expect(isDirectlyExecuted(['node', '/app/scripts/auth-preflight.js'])).toBe(true);
      expect(isDirectlyExecuted(['node', '/app/scripts/auth-preflight'])).toBe(true);
      expect(isDirectlyExecuted(['node', '/app/node_modules/vitest/vitest.mjs'])).toBe(false);
      expect(isDirectlyExecuted([])).toBe(false);
    });

    it('runCli executes preflight, outputs report, and performs disconnection in finally block', async () => {
      const disconnectSpy = vi.spyOn(mongoose, 'disconnect').mockResolvedValue();
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const fakeDb = {
        collection: (name: string) => {
          if (name === 'users') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                { key: { isOwner: 1 }, unique: true, partialFilterExpression: { isOwner: true } },
                { key: { email: 1 }, unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } },
              ]),
            };
          }
          if (name === 'sessions') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                { key: { tokenHash: 1 }, unique: true },
                { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
                { key: { userId: 1 } },
              ]),
            };
          }
          if (name === 'ratelimits') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                { key: { key: 1 }, unique: true },
                { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
              ]),
            };
          }
          return { indexes: vi.fn().mockResolvedValue([]) };
        },
      } as unknown as mongoose.mongo.Db;

      vi.spyOn(mongodb, 'connectDB').mockResolvedValue({
        connection: { db: fakeDb },
      } as unknown as typeof mongoose);

      vi.spyOn(User, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof User.find>);
      vi.spyOn(User, 'aggregate').mockResolvedValue([]);
      vi.spyOn(Session, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof Session.find>);
      vi.spyOn(Session, 'aggregate').mockResolvedValue([]);
      vi.spyOn(RateLimit, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof RateLimit.find>);
      vi.spyOn(RateLimit, 'aggregate').mockResolvedValue([]);

      process.exitCode = undefined;
      await runCli();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
      process.exitCode = undefined;
    });

    it('runCli sets process.exitCode = 1 on preflight error and still safely cleans up database connection', async () => {
      const disconnectSpy = vi.spyOn(mongoose, 'disconnect').mockResolvedValue();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.spyOn(mongodb, 'connectDB').mockRejectedValue(new Error('Connection timeout'));

      process.exitCode = undefined;
      await runCli();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Preflight Error:', 'Connection timeout');
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });

    it('runCli handles disconnect failure without masking original preflight error', async () => {
      const disconnectSpy = vi.spyOn(mongoose, 'disconnect').mockRejectedValue(new Error('Disconnect socket failure'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.spyOn(mongodb, 'connectDB').mockRejectedValue(new Error('Initial preflight error'));

      process.exitCode = undefined;
      await runCli();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Preflight Error:', 'Initial preflight error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Database disconnect error during CLI cleanup:',
        'Disconnect socket failure'
      );
      expect(disconnectSpy).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });
  });

  describe('Index Pattern Matching and Order-Independent Helpers', () => {
    it('findIndexesMatchingKey matches exact key patterns and ignores compound indexes', () => {
      const indexes: MongoRawIndex[] = [
        { key: { _id: 1 } },
        { key: { email: 1 } },
        { key: { email: 1, name: 1 } },
        { key: { isOwner: 1 } },
      ];

      const emailMatches = findIndexesMatchingKey(indexes, { email: 1 });
      expect(emailMatches).toHaveLength(1);
      expect(emailMatches[0].key).toEqual({ email: 1 });

      const compoundMatches = findIndexesMatchingKey(indexes, { email: 1, name: 1 });
      expect(compoundMatches).toHaveLength(1);

      const missingMatches = findIndexesMatchingKey(indexes, { nonExistent: 1 });
      expect(missingMatches).toHaveLength(0);
    });

    it('isValidEmailPartialFilter validates exact filter options in an order-independent manner', () => {
      // Correct standard order
      expect(isValidEmailPartialFilter({ email: { $type: 'string', $gt: '' } })).toBe(true);

      // Correct reverse property order
      expect(isValidEmailPartialFilter({ email: { $gt: '', $type: 'string' } })).toBe(true);

      // Missing partial filter
      expect(isValidEmailPartialFilter(undefined)).toBe(false);
      expect(isValidEmailPartialFilter(null)).toBe(false);
      expect(isValidEmailPartialFilter({})).toBe(false);

      // Incorrect $type
      expect(isValidEmailPartialFilter({ email: { $type: 'number', $gt: '' } })).toBe(false);

      // Incorrect $gt
      expect(isValidEmailPartialFilter({ email: { $type: 'string', $gt: 'abc' } })).toBe(false);

      // Extraneous filter options
      expect(isValidEmailPartialFilter({ email: { $type: 'string', $gt: '', $exists: true } })).toBe(false);
      expect(isValidEmailPartialFilter({ email: { $type: 'string', $gt: '' }, extra: true })).toBe(false);
    });

    it('isValidOwnerPartialFilter validates exact { isOwner: true } requirement', () => {
      expect(isValidOwnerPartialFilter({ isOwner: true })).toBe(true);
      expect(isValidOwnerPartialFilter({ isOwner: false })).toBe(false);
      expect(isValidOwnerPartialFilter({ isOwner: 1 })).toBe(false);
      expect(isValidOwnerPartialFilter({ role: 'owner' })).toBe(false);
      expect(isValidOwnerPartialFilter(undefined)).toBe(false);
      expect(isValidOwnerPartialFilter(null)).toBe(false);
      expect(isValidOwnerPartialFilter({ isOwner: true, role: 'owner' })).toBe(false);
    });
  });

  describe('Index Inspection Logic', () => {
    it('reports PASS when all 7 required authentication indexes exist with correct specs', async () => {
      const mockDb = {
        collection: (name: string) => {
          if (name === 'users') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                {
                  key: { isOwner: 1 },
                  name: 'isOwner_1',
                  unique: true,
                  partialFilterExpression: { isOwner: true },
                },
                {
                  key: { email: 1 },
                  name: 'email_1',
                  unique: true,
                  partialFilterExpression: { email: { $type: 'string', $gt: '' } },
                },
              ]),
            };
          }
          if (name === 'sessions') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                { key: { tokenHash: 1 }, name: 'tokenHash_1', unique: true },
                { key: { expiresAt: 1 }, name: 'expiresAt_1', expireAfterSeconds: 0 },
                { key: { userId: 1 }, name: 'userId_1' },
              ]),
            };
          }
          if (name === 'ratelimits') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                { key: { key: 1 }, name: 'key_1', unique: true },
                { key: { expiresAt: 1 }, name: 'expiresAt_1', expireAfterSeconds: 0 },
              ]),
            };
          }
          return { indexes: vi.fn().mockResolvedValue([]) };
        },
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mockDb);

      expect(checks).toHaveLength(7);
      expect(checks.every((c) => c.status === 'PASS')).toBe(true);
    });

    it('reports PASS when email and owner partial filter properties are given in different key order', async () => {
      const mockDb = {
        collection: (name: string) => {
          if (name === 'users') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                {
                  key: { isOwner: 1 },
                  name: 'isOwner_1',
                  unique: true,
                  partialFilterExpression: { isOwner: true },
                },
                {
                  key: { email: 1 },
                  name: 'email_1',
                  unique: true,
                  // Reverse key order in partial filter
                  partialFilterExpression: { email: { $gt: '', $type: 'string' } },
                },
              ]),
            };
          }
          if (name === 'sessions') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                { key: { tokenHash: 1 }, name: 'tokenHash_1', unique: true },
                { key: { expiresAt: 1 }, name: 'expiresAt_1', expireAfterSeconds: 0 },
                { key: { userId: 1 }, name: 'userId_1' },
              ]),
            };
          }
          if (name === 'ratelimits') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                { key: { key: 1 }, name: 'key_1', unique: true },
                { key: { expiresAt: 1 }, name: 'expiresAt_1', expireAfterSeconds: 0 },
              ]),
            };
          }
          return { indexes: vi.fn().mockResolvedValue([]) };
        },
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mockDb);
      const emailCheck = checks.find((c) => c.id === 'IDX_USER_EMAIL');
      expect(emailCheck?.status).toBe('PASS');
    });

    it('reports FAIL when email index is missing partialFilterExpression', async () => {
      const mockDb = {
        collection: (name: string) => ({
          indexes: vi.fn().mockResolvedValue(
            name === 'users'
              ? [
                  { key: { _id: 1 } },
                  { key: { isOwner: 1 }, unique: true, partialFilterExpression: { isOwner: true } },
                  { key: { email: 1 }, unique: true }, // Missing partial filter
                ]
              : []
          ),
        }),
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mockDb);
      const emailCheck = checks.find((c) => c.id === 'IDX_USER_EMAIL');
      expect(emailCheck?.status).toBe('FAIL');
      expect(emailCheck?.details).toContain('partialFilterExpression must be { email: { $type: "string", $gt: "" } }');
    });

    it('reports FAIL when email index has incorrect $type in partialFilterExpression', async () => {
      const mockDb = {
        collection: (name: string) => ({
          indexes: vi.fn().mockResolvedValue(
            name === 'users'
              ? [
                  { key: { _id: 1 } },
                  { key: { isOwner: 1 }, unique: true, partialFilterExpression: { isOwner: true } },
                  { key: { email: 1 }, unique: true, partialFilterExpression: { email: { $type: 'number', $gt: '' } } },
                ]
              : []
          ),
        }),
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mockDb);
      const emailCheck = checks.find((c) => c.id === 'IDX_USER_EMAIL');
      expect(emailCheck?.status).toBe('FAIL');
    });

    it('reports FAIL when email index has incorrect $gt in partialFilterExpression', async () => {
      const mockDb = {
        collection: (name: string) => ({
          indexes: vi.fn().mockResolvedValue(
            name === 'users'
              ? [
                  { key: { _id: 1 } },
                  { key: { isOwner: 1 }, unique: true, partialFilterExpression: { isOwner: true } },
                  { key: { email: 1 }, unique: true, partialFilterExpression: { email: { $type: 'string', $gt: 'abc' } } },
                ]
              : []
          ),
        }),
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mockDb);
      const emailCheck = checks.find((c) => c.id === 'IDX_USER_EMAIL');
      expect(emailCheck?.status).toBe('FAIL');
    });

    it('reports FAIL when email index is missing unique: true', async () => {
      const mockDb = {
        collection: (name: string) => ({
          indexes: vi.fn().mockResolvedValue(
            name === 'users'
              ? [
                  { key: { _id: 1 } },
                  { key: { isOwner: 1 }, unique: true, partialFilterExpression: { isOwner: true } },
                  { key: { email: 1 }, unique: false, partialFilterExpression: { email: { $type: 'string', $gt: '' } } },
                ]
              : []
          ),
        }),
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mockDb);
      const emailCheck = checks.find((c) => c.id === 'IDX_USER_EMAIL');
      expect(emailCheck?.status).toBe('FAIL');
      expect(emailCheck?.details).toContain('missing unique: true constraint');
    });

    it('reports FAIL when isOwner index has incorrect partialFilterExpression', async () => {
      const mockDb = {
        collection: (name: string) => ({
          indexes: vi.fn().mockResolvedValue(
            name === 'users'
              ? [
                  { key: { _id: 1 } },
                  { key: { isOwner: 1 }, unique: true, partialFilterExpression: { isOwner: false } },
                  { key: { email: 1 }, unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } },
                ]
              : []
          ),
        }),
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mockDb);
      const ownerCheck = checks.find((c) => c.id === 'IDX_USER_OWNER');
      expect(ownerCheck?.status).toBe('FAIL');
      expect(ownerCheck?.details).toContain('must have partialFilterExpression: { isOwner: true }');
    });

    it('reports FAIL when candidate indexes are ambiguous (multiple indexes matching the same key)', async () => {
      const mockDb = {
        collection: (name: string) => ({
          indexes: vi.fn().mockResolvedValue(
            name === 'users'
              ? [
                  { key: { _id: 1 } },
                  { key: { email: 1 }, name: 'email_1', unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } },
                  { key: { email: 1 }, name: 'email_legacy', unique: false },
                ]
              : []
          ),
        }),
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mockDb);
      const emailCheck = checks.find((c) => c.id === 'IDX_USER_EMAIL');
      expect(emailCheck?.status).toBe('FAIL');
      expect(emailCheck?.details).toContain('Ambiguous candidate indexes detected: found 2 indexes matching key { email: 1 }');
    });

    it('does not match compound indexes as single-field candidate indexes', async () => {
      const mockDb = {
        collection: (name: string) => ({
          indexes: vi.fn().mockResolvedValue(
            name === 'users'
              ? [
                  { key: { _id: 1 } },
                  { key: { email: 1, name: 1 }, unique: true }, // Compound index should NOT match single email index
                ]
              : []
          ),
        }),
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mockDb);
      const emailCheck = checks.find((c) => c.id === 'IDX_USER_EMAIL');
      expect(emailCheck?.status).toBe('NEEDS ATTENTION');
      expect(emailCheck?.details).toContain('Missing in database catalog');
    });

    it('reports NEEDS ATTENTION when schema-declared indexes have not been created yet in the database', async () => {
      const emptyDb = {
        collection: () => ({
          indexes: vi.fn().mockResolvedValue([{ key: { _id: 1 } }]),
        }),
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(emptyDb);

      expect(checks).toHaveLength(7);
      expect(checks.every((c) => c.status === 'NEEDS ATTENTION')).toBe(true);
      expect(checks.find((c) => c.id === 'IDX_USER_OWNER')?.details).toContain(
        'Missing in database catalog'
      );
    });

    it('reports FAIL when an index exists but has conflicting options (e.g. non-unique isOwner)', async () => {
      const mismatchedDb = {
        collection: (name: string) => {
          if (name === 'users') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                // Misconfigured: missing unique and partialFilterExpression
                { key: { isOwner: 1 }, name: 'isOwner_1', unique: false },
                { key: { email: 1 }, name: 'email_1', unique: true },
              ]),
            };
          }
          if (name === 'sessions') {
            return {
              indexes: vi.fn().mockResolvedValue([
                { key: { _id: 1 } },
                { key: { tokenHash: 1 }, unique: false }, // Misconfigured
                { key: { expiresAt: 1 }, expireAfterSeconds: 60 }, // Misconfigured (not 0)
                { key: { userId: 1 } },
              ]),
            };
          }
          return {
            indexes: vi.fn().mockResolvedValue([
              { key: { _id: 1 } },
              { key: { key: 1 }, unique: false }, // Misconfigured
              { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
            ]),
          };
        },
      } as unknown as mongoose.mongo.Db;

      const checks = await runAuthIndexInspection(mismatchedDb);

      const ownerCheck = checks.find((c) => c.id === 'IDX_USER_OWNER');
      expect(ownerCheck?.status).toBe('FAIL');
      expect(ownerCheck?.details).toContain('missing unique: true constraint');

      const tokenCheck = checks.find((c) => c.id === 'IDX_SESSION_TOKEN');
      expect(tokenCheck?.status).toBe('FAIL');

      const ttlCheck = checks.find((c) => c.id === 'IDX_SESSION_TTL');
      expect(ttlCheck?.status).toBe('FAIL');
      expect(ttlCheck?.details).toContain('expireAfterSeconds is 60 instead of 0');
    });
  });

  describe('Data Preflight & Integrity Inspection Logic', () => {
    it('passes clean database states with 0 or 1 owner', async () => {
      // 0 owners
      vi.spyOn(User, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof User.find>);
      vi.spyOn(User, 'aggregate').mockResolvedValue([]);
      vi.spyOn(Session, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof Session.find>);
      vi.spyOn(Session, 'aggregate').mockResolvedValue([]);
      vi.spyOn(RateLimit, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof RateLimit.find>);
      vi.spyOn(RateLimit, 'aggregate').mockResolvedValue([]);

      const checks = await runAuthDataInspection();

      expect(checks.every((c) => c.status === 'PASS')).toBe(true);
      expect(checks.find((c) => c.id === 'DATA_MULTIPLE_OWNERS')?.details).toContain(
        'Zero store owners'
      );
    });

    it('detects multiple owners and flags conflicting IDs for administrator remediation', async () => {
      const mockOwners = [
        { _id: new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567801'), name: 'Owner 1', isOwner: true },
        { _id: new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567802'), name: 'Owner 2', isOwner: true },
      ];

      vi.spyOn(User, 'find').mockImplementation((query: unknown) => {
        const q = query as { isOwner?: boolean; $or?: unknown };
        if (q.isOwner === true) {
          return { lean: vi.fn().mockResolvedValue(mockOwners) } as unknown as ReturnType<typeof User.find>;
        }
        return { lean: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof User.find>;
      });
      vi.spyOn(User, 'aggregate').mockResolvedValue([]);
      vi.spyOn(Session, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof Session.find>);
      vi.spyOn(Session, 'aggregate').mockResolvedValue([]);
      vi.spyOn(RateLimit, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof RateLimit.find>);
      vi.spyOn(RateLimit, 'aggregate').mockResolvedValue([]);

      const checks = await runAuthDataInspection();
      const ownerCheck = checks.find((c) => c.id === 'DATA_MULTIPLE_OWNERS');

      expect(ownerCheck?.status).toBe('FAIL');
      expect(ownerCheck?.conflictingIds).toEqual([
        '60d5ecb8b5c9c61234567801',
        '60d5ecb8b5c9c61234567802',
      ]);
      expect(ownerCheck?.details).toContain('Detected 2 records with isOwner: true');
    });

    it('detects role and isOwner field inconsistencies', async () => {
      const inconsistentUsers = [
        { _id: new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567803'), name: 'Fake Owner', role: 'owner', isOwner: false },
      ];

      vi.spyOn(User, 'find').mockImplementation((query: unknown) => {
        const q = query as { $or?: unknown };
        if (q.$or) {
          return { lean: vi.fn().mockResolvedValue(inconsistentUsers) } as unknown as ReturnType<typeof User.find>;
        }
        return { lean: vi.fn().mockResolvedValue([]) } as unknown as ReturnType<typeof User.find>;
      });
      vi.spyOn(User, 'aggregate').mockResolvedValue([]);
      vi.spyOn(Session, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof Session.find>);
      vi.spyOn(Session, 'aggregate').mockResolvedValue([]);
      vi.spyOn(RateLimit, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof RateLimit.find>);
      vi.spyOn(RateLimit, 'aggregate').mockResolvedValue([]);

      const checks = await runAuthDataInspection();
      const roleCheck = checks.find((c) => c.id === 'DATA_OWNER_ROLE_MISMATCH');

      expect(roleCheck?.status).toBe('FAIL');
      expect(roleCheck?.conflictingIds).toContain('60d5ecb8b5c9c61234567803');
    });

    it('detects duplicate non-empty normalized emails', async () => {
      vi.spyOn(User, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof User.find>);

      vi.spyOn(User, 'aggregate').mockResolvedValue([
        {
          _id: 'admin@store.com',
          count: 2,
          ids: [
            new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567804'),
            new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567805'),
          ],
        },
      ]);
      vi.spyOn(Session, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof Session.find>);
      vi.spyOn(Session, 'aggregate').mockResolvedValue([]);
      vi.spyOn(RateLimit, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof RateLimit.find>);
      vi.spyOn(RateLimit, 'aggregate').mockResolvedValue([]);

      const checks = await runAuthDataInspection();
      const emailCheck = checks.find((c) => c.id === 'DATA_DUPLICATE_EMAILS');

      expect(emailCheck?.status).toBe('FAIL');
      expect(emailCheck?.conflictingIds).toEqual([
        '60d5ecb8b5c9c61234567804',
        '60d5ecb8b5c9c61234567805',
      ]);
    });

    it('detects duplicate session hashes and duplicate rate-limit keys', async () => {
      vi.spyOn(User, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof User.find>);
      vi.spyOn(User, 'aggregate').mockResolvedValue([]);

      vi.spyOn(Session, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof Session.find>);
      vi.spyOn(Session, 'aggregate').mockResolvedValue([
        {
          _id: 'duplicatehash123',
          count: 2,
          ids: [new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567806')],
        },
      ]);

      vi.spyOn(RateLimit, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof RateLimit.find>);
      vi.spyOn(RateLimit, 'aggregate').mockResolvedValue([
        {
          _id: 'login:127.0.0.1',
          count: 2,
          ids: [new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567807')],
        },
      ]);

      const checks = await runAuthDataInspection();
      const sessionCheck = checks.find((c) => c.id === 'DATA_DUPLICATE_SESSIONS');
      const rateLimitCheck = checks.find((c) => c.id === 'DATA_DUPLICATE_RATELIMITS');

      expect(sessionCheck?.status).toBe('FAIL');
      expect(sessionCheck?.conflictingIds).toContain('60d5ecb8b5c9c61234567806');

      expect(rateLimitCheck?.status).toBe('FAIL');
      expect(rateLimitCheck?.conflictingIds).toContain('60d5ecb8b5c9c61234567807');
    });

    it('detects malformed documents with missing or invalid required fields', async () => {
      vi.spyOn(User, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      } as unknown as ReturnType<typeof User.find>);
      vi.spyOn(User, 'aggregate').mockResolvedValue([]);

      // Malformed session with null tokenHash
      vi.spyOn(Session, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567808') }]),
      } as unknown as ReturnType<typeof Session.find>);
      vi.spyOn(Session, 'aggregate').mockResolvedValue([]);

      // Malformed rate-limit with missing expiresAt
      vi.spyOn(RateLimit, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: new mongoose.Types.ObjectId('60d5ecb8b5c9c61234567809') }]),
      } as unknown as ReturnType<typeof RateLimit.find>);
      vi.spyOn(RateLimit, 'aggregate').mockResolvedValue([]);

      const checks = await runAuthDataInspection();
      const malformedSessionCheck = checks.find((c) => c.id === 'DATA_MALFORMED_SESSIONS');
      const malformedRateLimitCheck = checks.find((c) => c.id === 'DATA_MALFORMED_RATELIMITS');

      expect(malformedSessionCheck?.status).toBe('FAIL');
      expect(malformedSessionCheck?.conflictingIds).toContain('60d5ecb8b5c9c61234567808');

      expect(malformedRateLimitCheck?.status).toBe('FAIL');
      expect(malformedRateLimitCheck?.conflictingIds).toContain('60d5ecb8b5c9c61234567809');
    });
  });

  describe('Report Formatting and Normalization Helper', () => {
    it('normalizes email addresses matching AuthService semantics', () => {
      expect(normalizeEmail('  Admin@Store.COM  ')).toBe('admin@store.com');
      expect(normalizeEmail('USER@EXAMPLE.NET')).toBe('user@example.net');
    });

    it('formats human-readable preflight report with all sections and summaries', () => {
      const output = formatPreflightReport({
        timestamp: '2026-10-18T00:00:00.000Z',
        overallStatus: 'FAIL',
        indexChecks: [
          {
            id: 'IDX_1',
            category: 'INDEX',
            name: 'Sample Index Check',
            status: 'FAIL',
            details: 'Index was not found in catalog.',
          },
        ],
        dataChecks: [
          {
            id: 'DATA_1',
            category: 'DATA',
            name: 'Sample Data Check',
            status: 'FAIL',
            details: 'Found conflicting data items.',
            conflictingIds: ['60d5ecb8b5c9c61234567810'],
          },
        ],
        summary: {
          totalChecks: 2,
          passed: 0,
          failed: 2,
          needsAttention: 0,
        },
      });

      expect(output).toContain('NEXORA POS — AUTHENTICATION DATABASE PREFLIGHT REPORT');
      expect(output).toContain('Overall Status: [FAIL]');
      expect(output).toContain('Sample Index Check');
      expect(output).toContain('Sample Data Check');
      expect(output).toContain('Conflicting IDs: 60d5ecb8b5c9c61234567810');
    });
  });
});
