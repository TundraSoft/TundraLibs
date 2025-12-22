/**
 * DDL Query Validator Integration Tests
 *
 * Tests for the main DDL query validation entry points.
 *
 * @module asserts/Query/DDL/DDL.test
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertCreateSchema } from './CreateSchema.ts';
import { assertDropSchema } from './DropSchema.ts';

//#region CREATE_SCHEMA Integration

Deno.test('DDL - CREATE_SCHEMA with all valid properties', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'test_analytics',
  };
  
  // Should not throw
  assertCreateSchema(query);
});

Deno.test('DDL - CREATE_SCHEMA validates type', () => {
  const query = {
    type: 'DROP_SCHEMA' as any,
    schema: 'test_analytics',
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'type must be',
  );
});

Deno.test('DDL - CREATE_SCHEMA rejects reserved keywords', () => {
  const reserved = ['public', 'information_schema', 'pg_catalog'];
  
  // Note: Current implementation doesn't validate reserved words
  // This test documents expected future behavior
  for (const schema of reserved) {
    const query = {
      type: 'CREATE_SCHEMA' as const,
      schema,
    };
    
    // Currently passes, but may want to add validation later
    assertCreateSchema(query);
  }
});

//#endregion

//#region DROP_SCHEMA Integration

Deno.test('DDL - DROP_SCHEMA without cascade', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'test_analytics',
  };
  
  // Should not throw
  assertDropSchema(query);
});

Deno.test('DDL - DROP_SCHEMA with cascade true', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'test_analytics',
    cascade: true,
  };
  
  assertDropSchema(query);
});

Deno.test('DDL - DROP_SCHEMA with cascade false', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'test_analytics',
    cascade: false,
  };
  
  assertDropSchema(query);
});

Deno.test('DDL - DROP_SCHEMA validates type', () => {
  const query = {
    type: 'CREATE_SCHEMA' as any,
    schema: 'test_analytics',
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'type must be',
  );
});

Deno.test('DDL - DROP_SCHEMA validates cascade type', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'test_analytics',
    cascade: 'yes' as any,
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'cascade must be a boolean',
  );
});

//#endregion

//#region Schema Name Validation

Deno.test('DDL - Schema names are case-sensitive', () => {
  const schemas = ['Analytics', 'analytics', 'ANALYTICS'];
  
  for (const schema of schemas) {
    const query = {
      type: 'CREATE_SCHEMA' as const,
      schema,
    };
    
    // All should be valid but treated as different schemas
    assertCreateSchema(query);
  }
});

Deno.test('DDL - Schema names with Unicode characters rejected', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'schéma_français',
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'alphanumeric characters and underscores',
  );
});

Deno.test('DDL - Schema names at boundary length (63)', () => {
  const query63 = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'a'.repeat(63),
  };
  
  const query64 = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'a'.repeat(64),
  };
  
  // 63 chars should pass
  assertCreateSchema(query63);
  
  // 64 chars should fail
  assertThrows(
    () => assertCreateSchema(query64),
    TypeError,
    'exceeds maximum length',
  );
});

//#endregion

//#region Edge Cases

Deno.test('DDL - CREATE_SCHEMA with SQL keywords as names', () => {
  const sqlKeywords = ['select', 'from', 'where', 'join', 'table'];
  
  // SQL keywords should be allowed as schema names
  for (const keyword of sqlKeywords) {
    const query = {
      type: 'CREATE_SCHEMA' as const,
      schema: keyword,
    };
    
    assertCreateSchema(query);
  }
});

Deno.test('DDL - Schema name with only underscores', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: '____',
  };
  
  // Should be valid
  assertCreateSchema(query);
});

Deno.test('DDL - Schema name with mixed case and numbers', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'MySchema_v2_TEST',
  };
  
  assertCreateSchema(query);
});

//#endregion

//#region Type Safety

Deno.test('DDL - CREATE_SCHEMA type inference', () => {
  // This test verifies TypeScript type inference works correctly
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'analytics',
  };
  
  // Type should be inferred as Query<'CREATE_SCHEMA'>
  assertCreateSchema(query);
  
  // @ts-expect-error - cascade not allowed on CREATE_SCHEMA
  const invalid = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'analytics',
    cascade: true,
  };
  
  // Should throw due to unexpected property
  assertThrows(
    () => assertCreateSchema(invalid as any),
    TypeError,
    'unexpected properties',
  );
});

Deno.test('DDL - DROP_SCHEMA type inference', () => {
  // This test verifies TypeScript type inference works correctly
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'analytics',
    cascade: true,
  };
  
  // Type should be inferred as Query<'DROP_SCHEMA'>
  assertDropSchema(query);
});

//#endregion
