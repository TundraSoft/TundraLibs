/**
 * DROP_SCHEMA Query Validator Tests
 *
 * @module asserts/Query/DDL/DropSchema.test
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertDropSchema } from './DropSchema.ts';

//#region Valid DROP_SCHEMA Queries

Deno.test('DROP_SCHEMA - valid simple schema', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'analytics',
  };
  
  // Should not throw
  assertDropSchema(query);
});

Deno.test('DROP_SCHEMA - valid schema with cascade false', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'analytics',
    cascade: false,
  };
  
  assertDropSchema(query);
});

Deno.test('DROP_SCHEMA - valid schema with cascade true', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'analytics',
    cascade: true,
  };
  
  assertDropSchema(query);
});

Deno.test('DROP_SCHEMA - valid schema with underscores', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'user_analytics',
  };
  
  assertDropSchema(query);
});

Deno.test('DROP_SCHEMA - valid schema starting with underscore', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: '_private_schema',
    cascade: true,
  };
  
  assertDropSchema(query);
});

Deno.test('DROP_SCHEMA - valid schema with numbers', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'analytics_v2',
  };
  
  assertDropSchema(query);
});

Deno.test('DROP_SCHEMA - valid schema at max length (63 chars)', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'a'.repeat(63),
  };
  
  assertDropSchema(query);
});

//#endregion

//#region Invalid Type

Deno.test('DROP_SCHEMA - throws on wrong type', () => {
  const query = {
    type: 'DROP_TABLE' as any,
    schema: 'analytics',
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    "type must be 'DROP_SCHEMA'",
  );
});

//#endregion

//#region Invalid Schema Name

Deno.test('DROP_SCHEMA - throws on missing schema', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
  } as any;
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'schema name is required',
  );
});

Deno.test('DROP_SCHEMA - throws on empty schema name', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: '',
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'schema name cannot be empty',
  );
});

Deno.test('DROP_SCHEMA - throws on whitespace-only schema name', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: '   ',
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'schema name cannot be empty or whitespace',
  );
});

Deno.test('DROP_SCHEMA - throws on non-string schema', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 123 as any,
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'schema must be a string',
  );
});

Deno.test('DROP_SCHEMA - throws on schema starting with number', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: '2analytics',
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'must start with a letter or underscore',
  );
});

Deno.test('DROP_SCHEMA - throws on schema with special characters', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'user-analytics',
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'contain only alphanumeric characters and underscores',
  );
});

Deno.test('DROP_SCHEMA - throws on schema with spaces', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'user analytics',
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'contain only alphanumeric characters and underscores',
  );
});

Deno.test('DROP_SCHEMA - throws on schema with dots', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'user.analytics',
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'contain only alphanumeric characters and underscores',
  );
});

Deno.test('DROP_SCHEMA - throws on schema exceeding max length', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'a'.repeat(64),
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'exceeds maximum length of 63 characters',
  );
});

//#endregion

//#region Invalid Cascade Property

Deno.test('DROP_SCHEMA - throws on non-boolean cascade', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'analytics',
    cascade: 'yes' as any,
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'cascade must be a boolean',
  );
});

Deno.test('DROP_SCHEMA - throws on numeric cascade', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'analytics',
    cascade: 1 as any,
  };
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'cascade must be a boolean',
  );
});

//#endregion

//#region Invalid Extra Properties

Deno.test('DROP_SCHEMA - throws on unexpected property', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'analytics',
    extra: 'not allowed',
  } as any;
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'unexpected properties: extra',
  );
});

Deno.test('DROP_SCHEMA - throws on multiple unexpected properties', () => {
  const query = {
    type: 'DROP_SCHEMA' as const,
    schema: 'analytics',
    ifExists: true,
    table: 'users',
  } as any;
  
  assertThrows(
    () => assertDropSchema(query),
    TypeError,
    'unexpected properties',
  );
});

//#endregion
