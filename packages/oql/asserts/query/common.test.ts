/**
 * @fileoverview Tests for shared query-property validators.
 * @module
 */

import { describe, it } from '../../../compat/test.ts';
import * as asserts from '@std/asserts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from './common.ts';

// =============================================================================
// Test Data
// =============================================================================

const validQuery = {
  type: 'SELECT',
  table: 'users',
  schema: 'public',
  columns: ['id', 'name'],
};

// =============================================================================
// Test Suites
// =============================================================================

describe('oql.asserts.Query.Common', () => {
  describe('assertTableName', () => {
    it('should accept valid table name', () => {
      asserts.assertStrictEquals(
        assertTableName({ table: 'users' }, 'SELECT'),
        undefined,
      );
      asserts.assertStrictEquals(
        assertTableName({ table: 'products' }, 'INSERT'),
        undefined,
      );
    });

    it('should throw if table is missing', () => {
      asserts.assertThrows(
        () => assertTableName({}, 'SELECT'),
        TypeError,
        "'table' is required",
      );
    });

    it('should throw if table is null', () => {
      asserts.assertThrows(
        () => assertTableName({ table: null }, 'SELECT'),
        TypeError,
        "'table' is required",
      );
    });

    it('should throw if table is undefined', () => {
      asserts.assertThrows(
        () => assertTableName({ table: undefined }, 'SELECT'),
        TypeError,
        "'table' is required",
      );
    });

    it('should throw if table is not a string', () => {
      asserts.assertThrows(
        () => assertTableName({ table: 123 }, 'SELECT'),
        TypeError,
        "'table' must be a string, got number",
      );

      asserts.assertThrows(
        () => assertTableName({ table: [] }, 'SELECT'),
        TypeError,
        "'table' must be a string, got object",
      );

      asserts.assertThrows(
        () => assertTableName({ table: {} }, 'SELECT'),
        TypeError,
        "'table' must be a string, got object",
      );
    });

    it('should throw if table is empty string', () => {
      asserts.assertThrows(
        () => assertTableName({ table: '' }, 'SELECT'),
        TypeError,
        "'table' must be a non-empty string",
      );
    });

    it('should throw if table is whitespace only', () => {
      asserts.assertThrows(
        () => assertTableName({ table: '   ' }, 'SELECT'),
        TypeError,
        "'table' must be a non-empty string",
      );
    });

    it('should include context in error message', () => {
      asserts.assertThrows(
        () => assertTableName({}, 'INSERT'),
        TypeError,
        'Invalid INSERT query',
      );

      asserts.assertThrows(
        () => assertTableName({}, 'UPDATE'),
        TypeError,
        'Invalid UPDATE query',
      );
    });
  });

  describe('assertSchemaName', () => {
    it('should accept valid schema name', () => {
      asserts.assertStrictEquals(
        assertSchemaName({ schema: 'public' }, 'SELECT'),
        undefined,
      );
      asserts.assertStrictEquals(
        assertSchemaName({ schema: 'custom_schema' }, 'INSERT'),
        undefined,
      );
    });

    it('should accept undefined schema (optional)', () => {
      asserts.assertStrictEquals(
        assertSchemaName({}, 'SELECT'),
        undefined,
      );
      asserts.assertStrictEquals(
        assertSchemaName({ schema: undefined }, 'SELECT'),
        undefined,
      );
    });

    it('should throw if schema is not a string', () => {
      asserts.assertThrows(
        () => assertSchemaName({ schema: 123 }, 'SELECT'),
        TypeError,
        "'schema' must be a string if provided, got number",
      );

      asserts.assertThrows(
        () => assertSchemaName({ schema: [] }, 'SELECT'),
        TypeError,
        "'schema' must be a string if provided, got object",
      );
    });

    it('should throw if schema is empty string', () => {
      asserts.assertThrows(
        () => assertSchemaName({ schema: '' }, 'SELECT'),
        TypeError,
        "'schema' must be a non-empty string if provided",
      );
    });

    it('should throw if schema is whitespace only', () => {
      asserts.assertThrows(
        () => assertSchemaName({ schema: '   ' }, 'SELECT'),
        TypeError,
        "'schema' must be a non-empty string if provided",
      );
    });

    it('should include context in error message', () => {
      asserts.assertThrows(
        () => assertSchemaName({ schema: '' }, 'UPDATE'),
        TypeError,
        'Invalid UPDATE query',
      );
    });
  });

  describe('assertQueryType', () => {
    it('should accept matching type', () => {
      asserts.assertStrictEquals(
        assertQueryType({ type: 'SELECT' }, 'SELECT', 'SELECT'),
        undefined,
      );
      asserts.assertStrictEquals(
        assertQueryType({ type: 'INSERT' }, 'INSERT', 'INSERT'),
        undefined,
      );
    });

    it('should throw if type does not match expected', () => {
      asserts.assertThrows(
        () => assertQueryType({ type: 'SELECT' }, 'INSERT', 'INSERT'),
        TypeError,
        "Expected type 'INSERT', got 'SELECT'",
      );

      asserts.assertThrows(
        () => assertQueryType({ type: 'UPDATE' }, 'DELETE', 'DELETE'),
        TypeError,
        "Expected type 'DELETE', got 'UPDATE'",
      );
    });

    it('should include context in error message', () => {
      asserts.assertThrows(
        () => assertQueryType({ type: 'SELECT' }, 'INSERT', 'INSERT'),
        TypeError,
        'Invalid INSERT query',
      );
    });
  });

  describe('assertColumns', () => {
    it('should accept valid columns array', () => {
      const columns = assertColumns({ columns: ['id', 'name'] }, 'SELECT');
      asserts.assertEquals(columns, ['id', 'name']);
    });

    it('should accept single column', () => {
      const columns = assertColumns({ columns: ['id'] }, 'SELECT');
      asserts.assertEquals(columns, ['id']);
    });

    it('should throw if columns is missing', () => {
      asserts.assertThrows(
        () => assertColumns({}, 'SELECT'),
        TypeError,
        "'columns' must be a non-empty array",
      );
    });

    it('should throw if columns is not an array', () => {
      asserts.assertThrows(
        () => assertColumns({ columns: 'id' }, 'SELECT'),
        TypeError,
        "'columns' must be a non-empty array",
      );

      asserts.assertThrows(
        () => assertColumns({ columns: {} }, 'SELECT'),
        TypeError,
        "'columns' must be a non-empty array",
      );

      asserts.assertThrows(
        () => assertColumns({ columns: 123 }, 'SELECT'),
        TypeError,
        "'columns' must be a non-empty array",
      );
    });

    it('should throw if columns is empty array', () => {
      asserts.assertThrows(
        () => assertColumns({ columns: [] }, 'SELECT'),
        TypeError,
        "'columns' must be a non-empty array",
      );
    });

    it('should throw if column is not a string', () => {
      asserts.assertThrows(
        () => assertColumns({ columns: [123] }, 'SELECT'),
        TypeError,
        "Each column in 'columns' must be a non-empty string",
      );

      asserts.assertThrows(
        () => assertColumns({ columns: ['id', null] }, 'SELECT'),
        TypeError,
        "Each column in 'columns' must be a non-empty string",
      );
    });

    it('should throw if column is empty string', () => {
      asserts.assertThrows(
        () => assertColumns({ columns: [''] }, 'SELECT'),
        TypeError,
        "Each column in 'columns' must be a non-empty string",
      );

      asserts.assertThrows(
        () => assertColumns({ columns: ['id', ''] }, 'SELECT'),
        TypeError,
        "Each column in 'columns' must be a non-empty string",
      );
    });

    it('should throw if column is whitespace only', () => {
      asserts.assertThrows(
        () => assertColumns({ columns: ['   '] }, 'SELECT'),
        TypeError,
        "Each column in 'columns' must be a non-empty string",
      );
    });

    it('should throw if column has @ prefix', () => {
      asserts.assertThrows(
        () => assertColumns({ columns: ['@id'] }, 'SELECT'),
        TypeError,
        "Columns should be plain strings without '@' prefix. Got '@id'",
      );

      asserts.assertThrows(
        () => assertColumns({ columns: ['id', '@name'] }, 'SELECT'),
        TypeError,
        "Columns should be plain strings without '@' prefix. Got '@name'",
      );
    });

    it('should include context in error message', () => {
      asserts.assertThrows(
        () => assertColumns({ columns: [] }, 'INSERT'),
        TypeError,
        'Invalid INSERT query',
      );

      asserts.assertThrows(
        () => assertColumns({ columns: ['@id'] }, 'UPDATE'),
        TypeError,
        'Invalid UPDATE query',
      );
    });
  });
});
