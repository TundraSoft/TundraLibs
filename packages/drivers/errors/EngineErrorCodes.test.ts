/**
 * @fileoverview Tests for EngineErrorCodes constants.
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { type EngineErrorCode, EngineErrorCodes } from './EngineErrorCodes.ts';

// =============================================================================
// Test Data
// =============================================================================

const EXPECTED_ERROR_CODES: EngineErrorCode[] = [
  'UNKNOWN_ERROR',
  'INVALID_CONFIG_VALUE',
  'MISSING_CONFIG_VALUE',
  'CONNECTION_FAILED',
  'DISCONNECTION_FAILED',
  'NO_CONNECTION',
  'CONNECTION_LOST',
  'POOL_DRAINING',
  'POOL_ACQUIRE_TIMEOUT',
  'POOL_RESOURCE_FAILED',
  'OPERATION_FAILED',
  'UNSUPPORTED_OPERATION',
  'INVALID_AUTH',
  'PERMISSION_DENIED',
  'MISSING_PARAMETERS',
  'QUERY_EXECUTION_FAILED',
  'QUERY_TIMEOUT',
  'SYNTAX_ERROR',
  'DATABASE_NOT_FOUND',
  'TABLE_NOT_FOUND',
  'COLUMN_NOT_FOUND',
  'DUPLICATE_KEY',
  'FOREIGN_KEY_VIOLATION',
  'NOT_NULL_VIOLATION',
  'CHECK_VIOLATION',
  'DEADLOCK',
  'LOCK_TIMEOUT',
  'SERIALIZATION_FAILURE',
  'TRANSACTION_NOT_FOUND',
  'TRANSACTION_OPERATION_ERROR',
];

// =============================================================================
// Test Suites
// =============================================================================

describe('EngineErrorCodes', () => {
  describe('Structure', () => {
    it('should be a readonly object', () => {
      // EngineErrorCodes is typed as const satisfies, which makes it readonly
      // but not necessarily frozen. Check that it exists and has the right structure.
      asserts.assert(typeof EngineErrorCodes === 'object');
      asserts.assert(EngineErrorCodes !== null);
    });

    it('should have all expected error codes', () => {
      for (const code of EXPECTED_ERROR_CODES) {
        asserts.assert(
          Object.hasOwn(EngineErrorCodes, code),
          `Missing error code: ${code}`,
        );
      }
    });

    it('should have error messages as string values', () => {
      for (const [code, message] of Object.entries(EngineErrorCodes)) {
        asserts.assert(
          typeof message === 'string',
          `Error code ${code} should have string message`,
        );
        asserts.assert(
          message.length > 0,
          `Error code ${code} should have non-empty message`,
        );
      }
    });

    it('should have correct number of error codes', () => {
      const actualCount = Object.keys(EngineErrorCodes).length;
      asserts.assertStrictEquals(actualCount, EXPECTED_ERROR_CODES.length);
    });
  });

  describe('Configuration Errors', () => {
    it('should have INVALID_CONFIG_VALUE error', () => {
      asserts.assert(EngineErrorCodes.INVALID_CONFIG_VALUE !== undefined);
      asserts.assert(
        EngineErrorCodes.INVALID_CONFIG_VALUE.includes('Configuration value'),
      );
      asserts.assert(EngineErrorCodes.INVALID_CONFIG_VALUE.includes('invalid'));
    });

    it('should have MISSING_CONFIG_VALUE error', () => {
      asserts.assert(EngineErrorCodes.MISSING_CONFIG_VALUE !== undefined);
      asserts.assert(
        EngineErrorCodes.MISSING_CONFIG_VALUE.includes(
          'Required configuration',
        ),
      );
      asserts.assert(EngineErrorCodes.MISSING_CONFIG_VALUE.includes('missing'));
    });
  });

  describe('Connection Lifecycle Errors', () => {
    it('should have CONNECTION_FAILED error', () => {
      asserts.assert(EngineErrorCodes.CONNECTION_FAILED !== undefined);
      asserts.assert(
        EngineErrorCodes.CONNECTION_FAILED.includes('Failed to connect'),
      );
    });

    it('should have DISCONNECTION_FAILED error', () => {
      asserts.assert(EngineErrorCodes.DISCONNECTION_FAILED !== undefined);
      asserts.assert(
        EngineErrorCodes.DISCONNECTION_FAILED.includes('Failed to disconnect'),
      );
    });

    it('should have NO_CONNECTION error', () => {
      asserts.assert(EngineErrorCodes.NO_CONNECTION !== undefined);
      asserts.assert(
        EngineErrorCodes.NO_CONNECTION.includes('No connection available'),
      );
    });

    it('should have CONNECTION_LOST error', () => {
      asserts.assert(EngineErrorCodes.CONNECTION_LOST !== undefined);
      asserts.assert(EngineErrorCodes.CONNECTION_LOST.includes('Connection'));
      asserts.assert(EngineErrorCodes.CONNECTION_LOST.includes('lost'));
    });
  });

  describe('Pool Errors', () => {
    it('should have POOL_DRAINING error', () => {
      asserts.assert(EngineErrorCodes.POOL_DRAINING !== undefined);
      asserts.assert(EngineErrorCodes.POOL_DRAINING.includes('Pool'));
      asserts.assert(EngineErrorCodes.POOL_DRAINING.includes('draining'));
    });

    it('should have POOL_ACQUIRE_TIMEOUT error', () => {
      asserts.assert(EngineErrorCodes.POOL_ACQUIRE_TIMEOUT !== undefined);
      asserts.assert(
        EngineErrorCodes.POOL_ACQUIRE_TIMEOUT.includes('Acquiring'),
      );
      asserts.assert(
        EngineErrorCodes.POOL_ACQUIRE_TIMEOUT.includes('timed out'),
      );
    });

    it('should have POOL_RESOURCE_FAILED error', () => {
      asserts.assert(EngineErrorCodes.POOL_RESOURCE_FAILED !== undefined);
      asserts.assert(
        EngineErrorCodes.POOL_RESOURCE_FAILED.includes('Failed to create'),
      );
      asserts.assert(
        EngineErrorCodes.POOL_RESOURCE_FAILED.includes('pool resource'),
      );
    });
  });

  describe('Operation Errors', () => {
    it('should have OPERATION_FAILED error', () => {
      asserts.assert(EngineErrorCodes.OPERATION_FAILED !== undefined);
      asserts.assert(EngineErrorCodes.OPERATION_FAILED.includes('Operation'));
      asserts.assert(EngineErrorCodes.OPERATION_FAILED.includes('failed'));
    });

    it('should have UNSUPPORTED_OPERATION error', () => {
      asserts.assert(EngineErrorCodes.UNSUPPORTED_OPERATION !== undefined);
      asserts.assert(
        EngineErrorCodes.UNSUPPORTED_OPERATION.includes('not supported'),
      );
    });
  });

  describe('Authentication Errors', () => {
    it('should have INVALID_AUTH error', () => {
      asserts.assert(EngineErrorCodes.INVALID_AUTH !== undefined);
      asserts.assert(
        EngineErrorCodes.INVALID_AUTH.includes('Authentication failed'),
      );
    });

    it('should have PERMISSION_DENIED error', () => {
      asserts.assert(EngineErrorCodes.PERMISSION_DENIED !== undefined);
      asserts.assert(
        EngineErrorCodes.PERMISSION_DENIED.includes('Permission denied'),
      );
    });
  });

  describe('Query Errors', () => {
    it('should have MISSING_PARAMETERS error', () => {
      asserts.assert(EngineErrorCodes.MISSING_PARAMETERS !== undefined);
      asserts.assert(
        EngineErrorCodes.MISSING_PARAMETERS.includes('Required parameters'),
      );
      asserts.assert(
        EngineErrorCodes.MISSING_PARAMETERS.includes('not provided'),
      );
    });

    it('should have QUERY_EXECUTION_FAILED error', () => {
      asserts.assert(EngineErrorCodes.QUERY_EXECUTION_FAILED !== undefined);
      asserts.assert(
        EngineErrorCodes.QUERY_EXECUTION_FAILED.includes(
          'Query execution failed',
        ),
      );
    });

    it('should have QUERY_TIMEOUT error', () => {
      asserts.assert(EngineErrorCodes.QUERY_TIMEOUT !== undefined);
      asserts.assert(
        EngineErrorCodes.QUERY_TIMEOUT.includes('Query timed out'),
      );
    });

    it('should have SYNTAX_ERROR error', () => {
      asserts.assert(EngineErrorCodes.SYNTAX_ERROR !== undefined);
      asserts.assert(
        EngineErrorCodes.SYNTAX_ERROR.includes('SQL syntax error'),
      );
    });
  });

  describe('Schema Errors', () => {
    it('should have DATABASE_NOT_FOUND error', () => {
      asserts.assert(EngineErrorCodes.DATABASE_NOT_FOUND !== undefined);
      asserts.assert(
        EngineErrorCodes.DATABASE_NOT_FOUND.includes('Database not found'),
      );
    });

    it('should have TABLE_NOT_FOUND error', () => {
      asserts.assert(EngineErrorCodes.TABLE_NOT_FOUND !== undefined);
      asserts.assert(
        EngineErrorCodes.TABLE_NOT_FOUND.includes('Table not found'),
      );
    });

    it('should have COLUMN_NOT_FOUND error', () => {
      asserts.assert(EngineErrorCodes.COLUMN_NOT_FOUND !== undefined);
      asserts.assert(
        EngineErrorCodes.COLUMN_NOT_FOUND.includes('Column not found'),
      );
    });
  });

  describe('Constraint Violation Errors', () => {
    it('should have DUPLICATE_KEY error', () => {
      asserts.assert(EngineErrorCodes.DUPLICATE_KEY !== undefined);
      asserts.assert(EngineErrorCodes.DUPLICATE_KEY.includes('Duplicate key'));
    });

    it('should have FOREIGN_KEY_VIOLATION error', () => {
      asserts.assert(EngineErrorCodes.FOREIGN_KEY_VIOLATION !== undefined);
      asserts.assert(
        EngineErrorCodes.FOREIGN_KEY_VIOLATION.includes('Foreign key'),
      );
    });

    it('should have NOT_NULL_VIOLATION error', () => {
      asserts.assert(EngineErrorCodes.NOT_NULL_VIOLATION !== undefined);
      asserts.assert(EngineErrorCodes.NOT_NULL_VIOLATION.includes('NOT NULL'));
    });

    it('should have CHECK_VIOLATION error', () => {
      asserts.assert(EngineErrorCodes.CHECK_VIOLATION !== undefined);
      asserts.assert(
        EngineErrorCodes.CHECK_VIOLATION.includes('CHECK constraint'),
      );
    });
  });

  describe('Concurrency Errors', () => {
    it('should have DEADLOCK error', () => {
      asserts.assert(EngineErrorCodes.DEADLOCK !== undefined);
      asserts.assert(EngineErrorCodes.DEADLOCK.includes('Deadlock detected'));
    });

    it('should have LOCK_TIMEOUT error', () => {
      asserts.assert(EngineErrorCodes.LOCK_TIMEOUT !== undefined);
      asserts.assert(
        EngineErrorCodes.LOCK_TIMEOUT.includes('Lock acquisition timed out'),
      );
    });

    it('should have SERIALIZATION_FAILURE error', () => {
      asserts.assert(EngineErrorCodes.SERIALIZATION_FAILURE !== undefined);
      asserts.assert(
        EngineErrorCodes.SERIALIZATION_FAILURE.includes(
          'Serialization failure',
        ),
      );
    });
  });

  describe('Transaction Errors', () => {
    it('should have TRANSACTION_NOT_FOUND error', () => {
      asserts.assert(EngineErrorCodes.TRANSACTION_NOT_FOUND !== undefined);
      asserts.assert(
        EngineErrorCodes.TRANSACTION_NOT_FOUND.includes('Transaction'),
      );
      asserts.assert(
        EngineErrorCodes.TRANSACTION_NOT_FOUND.includes('not found'),
      );
    });

    it('should have TRANSACTION_OPERATION_ERROR error', () => {
      asserts.assert(
        EngineErrorCodes.TRANSACTION_OPERATION_ERROR !== undefined,
      );
      asserts.assert(
        EngineErrorCodes.TRANSACTION_OPERATION_ERROR.includes(
          'Transaction operation',
        ),
      );
      asserts.assert(
        EngineErrorCodes.TRANSACTION_OPERATION_ERROR.includes('failed'),
      );
    });
  });

  describe('Fallback Errors', () => {
    it('should have UNKNOWN_ERROR error', () => {
      asserts.assert(EngineErrorCodes.UNKNOWN_ERROR !== undefined);
      asserts.assert(EngineErrorCodes.UNKNOWN_ERROR.includes('Unknown error'));
    });
  });

  describe('Template Variables', () => {
    it('should use ${instanceId} variable in messages', () => {
      const messagesWithInstanceId = Object.values(EngineErrorCodes).filter(
        (msg) => msg.includes('${instanceId}'),
      );
      asserts.assert(
        messagesWithInstanceId.length > 0,
        'At least one message should use ${instanceId}',
      );
    });

    it('should use ${reason} variable where appropriate', () => {
      const codes: EngineErrorCode[] = [
        'UNKNOWN_ERROR',
        'INVALID_CONFIG_VALUE',
        'CONNECTION_LOST',
        'OPERATION_FAILED',
        'INVALID_AUTH',
        'PERMISSION_DENIED',
        'QUERY_EXECUTION_FAILED',
        'SYNTAX_ERROR',
      ];

      for (const code of codes) {
        asserts.assert(
          EngineErrorCodes[code].includes('${reason}'),
          `${code} should include \${reason} variable`,
        );
      }
    });

    it('should use ${option} variable in config errors', () => {
      asserts.assert(
        EngineErrorCodes.INVALID_CONFIG_VALUE.includes('${option}'),
      );
      asserts.assert(
        EngineErrorCodes.MISSING_CONFIG_VALUE.includes('${option}'),
      );
    });

    it('should use ${timeoutMs} variable in timeout errors', () => {
      asserts.assert(
        EngineErrorCodes.POOL_ACQUIRE_TIMEOUT.includes('${timeoutMs}'),
      );
      asserts.assert(EngineErrorCodes.QUERY_TIMEOUT.includes('${timeoutMs}'));
    });

    it('should use ${transactionId} variable in transaction errors', () => {
      asserts.assert(
        EngineErrorCodes.TRANSACTION_NOT_FOUND.includes('${transactionId}'),
      );
      asserts.assert(
        EngineErrorCodes.TRANSACTION_OPERATION_ERROR.includes(
          '${transactionId}',
        ),
      );
    });

    it('should use ${constraint} variable in constraint errors', () => {
      asserts.assert(EngineErrorCodes.DUPLICATE_KEY.includes('${constraint}'));
      asserts.assert(
        EngineErrorCodes.FOREIGN_KEY_VIOLATION.includes('${constraint}'),
      );
      asserts.assert(
        EngineErrorCodes.CHECK_VIOLATION.includes('${constraint}'),
      );
    });

    it('should use ${column} variable where appropriate', () => {
      asserts.assert(EngineErrorCodes.NOT_NULL_VIOLATION.includes('${column}'));
      asserts.assert(EngineErrorCodes.COLUMN_NOT_FOUND.includes('${column}'));
    });

    it('should use ${table} variable in TABLE_NOT_FOUND', () => {
      asserts.assert(EngineErrorCodes.TABLE_NOT_FOUND.includes('${table}'));
    });

    it('should use ${database} variable in DATABASE_NOT_FOUND', () => {
      asserts.assert(
        EngineErrorCodes.DATABASE_NOT_FOUND.includes('${database}'),
      );
    });

    it('should use ${operation} variable in operation errors', () => {
      asserts.assert(
        EngineErrorCodes.OPERATION_FAILED.includes('${operation}'),
      );
      asserts.assert(
        EngineErrorCodes.UNSUPPORTED_OPERATION.includes('${operation}'),
      );
      asserts.assert(
        EngineErrorCodes.TRANSACTION_OPERATION_ERROR.includes('${operation}'),
      );
    });

    it('should use ${missing} variable in MISSING_PARAMETERS', () => {
      asserts.assert(
        EngineErrorCodes.MISSING_PARAMETERS.includes('${missing}'),
      );
    });
  });

  describe('Message Quality', () => {
    it('should have clear and descriptive messages', () => {
      for (const [code, message] of Object.entries(EngineErrorCodes)) {
        asserts.assert(
          message.length >= 10,
          `Error code ${code} message is too short: "${message}"`,
        );
      }
    });

    it('should not have duplicate messages', () => {
      const messages = Object.values(EngineErrorCodes);
      const uniqueMessages = new Set(messages);
      asserts.assertStrictEquals(
        uniqueMessages.size,
        messages.length,
        'Some error codes have duplicate messages',
      );
    });

    it('should use consistent formatting', () => {
      for (const [code, message] of Object.entries(EngineErrorCodes)) {
        // Messages should start with capital letter
        asserts.assert(
          /^[A-Z]/.test(message),
          `Error code ${code} message should start with capital letter`,
        );

        // Should not end with punctuation
        asserts.assert(
          !/[.!?]$/.test(message),
          `Error code ${code} message should not end with punctuation`,
        );
      }
    });
  });

  describe('Type Safety', () => {
    it('should have correct TypeScript type', () => {
      const code: EngineErrorCode = 'CONNECTION_FAILED';
      asserts.assertStrictEquals(code, 'CONNECTION_FAILED');
    });

    it('should allow all defined codes as type', () => {
      const codes: EngineErrorCode[] = EXPECTED_ERROR_CODES;
      asserts.assertStrictEquals(codes.length, EXPECTED_ERROR_CODES.length);
    });
  });
});
