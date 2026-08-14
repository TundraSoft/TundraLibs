/**
 * @fileoverview Tests for EngineError class.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { EngineError, type EngineErrorMeta } from './EngineError.ts';
import { type EngineErrorCode, EngineErrorCodes } from './EngineErrorCodes.ts';

// =============================================================================
// Test Data
// =============================================================================

const VALID_INSTANCE_ID = 'POSTGRES::main';
const VALID_META: EngineErrorMeta = {
  instanceId: VALID_INSTANCE_ID,
  reason: 'Test reason',
};
const CAUSE_ERROR = new Error('Underlying cause');

// =============================================================================
// Test Suites
// =============================================================================

describe('EngineError', () => {
  describe('Constructor', () => {
    it('should create error with valid code and metadata', () => {
      const error = new EngineError('CONNECTION_FAILED', VALID_META);

      asserts.assertStrictEquals(error.code, 'CONNECTION_FAILED');
      asserts.assertStrictEquals(error.engine, 'POSTGRES');
      asserts.assertStrictEquals(error.connectionName, 'main');
      asserts.assertStrictEquals(error.name, 'EngineError');
      asserts.assert(error instanceof Error);
      asserts.assert(error instanceof EngineError);
    });

    it('should include cause when provided', () => {
      const error = new EngineError(
        'CONNECTION_FAILED',
        VALID_META,
        CAUSE_ERROR,
      );

      asserts.assertStrictEquals(error.cause, CAUSE_ERROR);
    });

    it('should parse instanceId correctly', () => {
      const meta: EngineErrorMeta = {
        instanceId: 'MARIA::production',
      };
      const error = new EngineError('CONNECTION_FAILED', meta);

      asserts.assertStrictEquals(error.engine, 'MARIA');
      asserts.assertStrictEquals(error.connectionName, 'production');
      asserts.assertStrictEquals(error.context.instanceId, 'MARIA::production');
    });

    it('should handle unknown error code', () => {
      const unknownCode = 'SOME_UNKNOWN_CODE' as EngineErrorCode;
      const error = new EngineError(unknownCode, VALID_META);

      asserts.assertStrictEquals(error.code, 'UNKNOWN_ERROR');
      asserts.assertStrictEquals(
        error.context.originalCode,
        'SOME_UNKNOWN_CODE',
      );
    });

    it('should use error message from EngineErrorCodes', () => {
      const error = new EngineError('CONNECTION_FAILED', VALID_META);

      asserts.assert(error.message.includes('Failed to connect'));
    });
  });

  describe('Error Codes', () => {
    it('should handle CONNECTION_FAILED code', () => {
      const error = new EngineError('CONNECTION_FAILED', VALID_META);

      asserts.assertStrictEquals(error.code, 'CONNECTION_FAILED');
      asserts.assert(error.message.includes(VALID_INSTANCE_ID));
    });

    it('should handle DISCONNECTION_FAILED code', () => {
      const error = new EngineError('DISCONNECTION_FAILED', VALID_META);

      asserts.assertStrictEquals(error.code, 'DISCONNECTION_FAILED');
    });

    it('should handle NO_CONNECTION code', () => {
      const error = new EngineError('NO_CONNECTION', VALID_META);

      asserts.assertStrictEquals(error.code, 'NO_CONNECTION');
    });

    it('should handle CONNECTION_LOST code', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        reason: 'Network timeout',
      };
      const error = new EngineError('CONNECTION_LOST', meta);

      asserts.assertStrictEquals(error.code, 'CONNECTION_LOST');
      asserts.assert(error.message.includes('Network timeout'));
    });

    it('should handle POOL_DRAINING code', () => {
      const error = new EngineError('POOL_DRAINING', VALID_META);

      asserts.assertStrictEquals(error.code, 'POOL_DRAINING');
    });

    it('should handle POOL_ACQUIRE_TIMEOUT code', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        timeoutMs: 5000,
      };
      const error = new EngineError('POOL_ACQUIRE_TIMEOUT', meta);

      asserts.assertStrictEquals(error.code, 'POOL_ACQUIRE_TIMEOUT');
      asserts.assert(error.message.includes('5000ms'));
    });

    it('should handle QUERY_EXECUTION_FAILED code', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        reason: 'Syntax error',
      };
      const error = new EngineError('QUERY_EXECUTION_FAILED', meta);

      asserts.assertStrictEquals(error.code, 'QUERY_EXECUTION_FAILED');
    });

    it('should handle TRANSACTION_NOT_FOUND code', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        transactionId: 'tx-123',
      };
      const error = new EngineError('TRANSACTION_NOT_FOUND', meta);

      asserts.assertStrictEquals(error.code, 'TRANSACTION_NOT_FOUND');
      asserts.assert(error.message.includes('tx-123'));
    });

    it('should handle MISSING_PARAMETERS code', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        missing: 'id, name',
      };
      const error = new EngineError('MISSING_PARAMETERS', meta);

      asserts.assertStrictEquals(error.code, 'MISSING_PARAMETERS');
      asserts.assert(error.message.includes('id, name'));
    });
  });

  describe('Instance Properties', () => {
    it('should extract engine from instanceId', () => {
      const meta: EngineErrorMeta = {
        instanceId: 'SQLITE::test-db',
      };
      const error = new EngineError('CONNECTION_FAILED', meta);

      asserts.assertStrictEquals(error.engine, 'SQLITE');
    });

    it('should extract connection name from instanceId', () => {
      const meta: EngineErrorMeta = {
        instanceId: 'REDIS::cache-server',
      };
      const error = new EngineError('CONNECTION_FAILED', meta);

      asserts.assertStrictEquals(error.connectionName, 'cache-server');
    });

    it('should handle instanceId with multiple colons', () => {
      const meta: EngineErrorMeta = {
        instanceId: 'POSTGRES::server::prod',
      };
      const error = new EngineError('CONNECTION_FAILED', meta);

      asserts.assertStrictEquals(error.engine, 'POSTGRES');
      // Split only takes first part after ::
      asserts.assertStrictEquals(error.connectionName, 'server');
    });
  });

  describe('Message Formatting', () => {
    it('should include instanceId in message', () => {
      const error = new EngineError('CONNECTION_FAILED', VALID_META);

      asserts.assert(error.message.includes(VALID_INSTANCE_ID));
    });

    it('should include reason when provided', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        reason: 'Network unreachable',
      };
      const error = new EngineError('CONNECTION_LOST', meta);

      asserts.assert(error.message.includes('Network unreachable'));
    });

    it('should include timeout value when provided', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        timeoutMs: 10000,
      };
      const error = new EngineError('POOL_ACQUIRE_TIMEOUT', meta);

      asserts.assert(error.message.includes('10000ms'));
    });

    it('should include operation when provided', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        operation: 'backup',
        reason: 'Disk full',
      };
      const error = new EngineError('OPERATION_FAILED', meta);

      asserts.assert(error.message.includes('backup'));
      asserts.assert(error.message.includes('Disk full'));
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON correctly', () => {
      const error = new EngineError('CONNECTION_FAILED', VALID_META);
      const json = error.toJSON();

      asserts.assertStrictEquals(json.name, 'EngineError');
      asserts.assert(json.message.includes(VALID_INSTANCE_ID));
      asserts.assertEquals(json.context.instanceId, VALID_INSTANCE_ID);
    });

    it('should serialize to JSON with all properties', () => {
      const error = new EngineError('QUERY_EXECUTION_FAILED', VALID_META);
      const json = error.toJSON();

      asserts.assertStrictEquals(json.name, 'EngineError');
      asserts.assert(json.message.includes(VALID_INSTANCE_ID));
      // Code is stored as instance property, not in JSON
      asserts.assertStrictEquals(error.code, 'QUERY_EXECUTION_FAILED');
    });

    it('should include cause in JSON when present', () => {
      const error = new EngineError(
        'CONNECTION_FAILED',
        VALID_META,
        CAUSE_ERROR,
      );
      const json = error.toJSON();

      asserts.assert(json.cause !== undefined);
      if (
        typeof json.cause === 'object' && json.cause !== null &&
        'message' in json.cause
      ) {
        asserts.assertStrictEquals(json.cause.message, CAUSE_ERROR.message);
      }
    });

    it('should include originalCode when unknown code is used', () => {
      const unknownCode = 'INVALID_CODE' as EngineErrorCode;
      const error = new EngineError(unknownCode, VALID_META);
      const json = error.toJSON();

      asserts.assertStrictEquals(json.context.originalCode, 'INVALID_CODE');
    });
  });

  describe('Constraint Violation Errors', () => {
    it('should handle DUPLICATE_KEY error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        constraint: 'users_email_unique',
      };
      const error = new EngineError('DUPLICATE_KEY', meta);

      asserts.assertStrictEquals(error.code, 'DUPLICATE_KEY');
      asserts.assert(error.message.includes('users_email_unique'));
    });

    it('should handle FOREIGN_KEY_VIOLATION error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        constraint: 'fk_orders_user_id',
      };
      const error = new EngineError('FOREIGN_KEY_VIOLATION', meta);

      asserts.assertStrictEquals(error.code, 'FOREIGN_KEY_VIOLATION');
      asserts.assert(error.message.includes('fk_orders_user_id'));
    });

    it('should handle NOT_NULL_VIOLATION error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        column: 'email',
      };
      const error = new EngineError('NOT_NULL_VIOLATION', meta);

      asserts.assertStrictEquals(error.code, 'NOT_NULL_VIOLATION');
      asserts.assert(error.message.includes('email'));
    });

    it('should handle CHECK_VIOLATION error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        constraint: 'age_positive',
      };
      const error = new EngineError('CHECK_VIOLATION', meta);

      asserts.assertStrictEquals(error.code, 'CHECK_VIOLATION');
      asserts.assert(error.message.includes('age_positive'));
    });
  });

  describe('Concurrency Errors', () => {
    it('should handle DEADLOCK error', () => {
      const error = new EngineError('DEADLOCK', VALID_META);

      asserts.assertStrictEquals(error.code, 'DEADLOCK');
    });

    it('should handle LOCK_TIMEOUT error', () => {
      const error = new EngineError('LOCK_TIMEOUT', VALID_META);

      asserts.assertStrictEquals(error.code, 'LOCK_TIMEOUT');
    });

    it('should handle SERIALIZATION_FAILURE error', () => {
      const error = new EngineError('SERIALIZATION_FAILURE', VALID_META);

      asserts.assertStrictEquals(error.code, 'SERIALIZATION_FAILURE');
    });
  });

  describe('Schema Errors', () => {
    it('should handle DATABASE_NOT_FOUND error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        database: 'my_database',
      };
      const error = new EngineError('DATABASE_NOT_FOUND', meta);

      asserts.assertStrictEquals(error.code, 'DATABASE_NOT_FOUND');
      asserts.assert(error.message.includes('my_database'));
    });

    it('should handle TABLE_NOT_FOUND error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        table: 'users',
      };
      const error = new EngineError('TABLE_NOT_FOUND', meta);

      asserts.assertStrictEquals(error.code, 'TABLE_NOT_FOUND');
      asserts.assert(error.message.includes('users'));
    });

    it('should handle COLUMN_NOT_FOUND error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        column: 'email',
      };
      const error = new EngineError('COLUMN_NOT_FOUND', meta);

      asserts.assertStrictEquals(error.code, 'COLUMN_NOT_FOUND');
      asserts.assert(error.message.includes('email'));
    });
  });

  describe('Configuration Errors', () => {
    it('should handle INVALID_CONFIG_VALUE error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        option: 'poolSize',
        reason: 'Must be positive integer',
      };
      const error = new EngineError('INVALID_CONFIG_VALUE', meta);

      asserts.assertStrictEquals(error.code, 'INVALID_CONFIG_VALUE');
      asserts.assert(error.message.includes('poolSize'));
      asserts.assert(error.message.includes('Must be positive integer'));
    });

    it('should handle MISSING_CONFIG_VALUE error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        option: 'host',
      };
      const error = new EngineError('MISSING_CONFIG_VALUE', meta);

      asserts.assertStrictEquals(error.code, 'MISSING_CONFIG_VALUE');
      asserts.assert(error.message.includes('host'));
    });
  });

  describe('Authentication Errors', () => {
    it('should handle INVALID_AUTH error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        reason: 'Invalid credentials',
      };
      const error = new EngineError('INVALID_AUTH', meta);

      asserts.assertStrictEquals(error.code, 'INVALID_AUTH');
      asserts.assert(error.message.includes('Invalid credentials'));
    });

    it('should handle PERMISSION_DENIED error', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        reason: 'User lacks SELECT privilege',
      };
      const error = new EngineError('PERMISSION_DENIED', meta);

      asserts.assertStrictEquals(error.code, 'PERMISSION_DENIED');
      asserts.assert(error.message.includes('User lacks SELECT privilege'));
    });
  });

  describe('Edge Cases', () => {
    it('should handle instanceId without separator', () => {
      const meta: EngineErrorMeta = {
        instanceId: 'INVALID',
      };
      const error = new EngineError('CONNECTION_FAILED', meta);

      asserts.assertStrictEquals(error.engine, 'INVALID');
      // When no :: separator, split returns undefined for second element
      asserts.assertStrictEquals(error.connectionName, undefined as any);
    });

    it('should handle empty metadata fields', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        reason: '',
      };
      const error = new EngineError('CONNECTION_LOST', meta);

      asserts.assert(error.message.length > 0);
    });

    it('should handle metadata with additional custom fields', () => {
      const meta: EngineErrorMeta = {
        instanceId: VALID_INSTANCE_ID,
        customField: 'custom value',
        anotherField: 42,
      };
      const error = new EngineError('CONNECTION_FAILED', meta);

      asserts.assertStrictEquals(error.context.customField, 'custom value');
      asserts.assertStrictEquals(error.context.anotherField, 42);
    });
  });

  describe('Inheritance', () => {
    it('should be instance of Error', () => {
      const error = new EngineError('CONNECTION_FAILED', VALID_META);

      asserts.assert(error instanceof Error);
    });

    it('should be instance of EngineError', () => {
      const error = new EngineError('CONNECTION_FAILED', VALID_META);

      asserts.assert(error instanceof EngineError);
    });

    it('should have stack trace', () => {
      const error = new EngineError('CONNECTION_FAILED', VALID_META);

      asserts.assert(error.stack !== undefined);
      asserts.assert(typeof error.stack === 'string');
    });
  });
});
