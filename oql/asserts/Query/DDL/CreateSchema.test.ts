/**
 * CREATE_SCHEMA Query Validator Tests
 *
 * @module asserts/Query/DDL/CreateSchema.test
 */

import { assertThrows } from 'jsr:@std/assert@1';
import { assertCreateSchema } from './CreateSchema.ts';

//#region Valid CREATE_SCHEMA Queries

Deno.test('CREATE_SCHEMA - valid simple schema', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'analytics',
  };
  
  // Should not throw
  assertCreateSchema(query);
});

Deno.test('CREATE_SCHEMA - valid schema with underscores', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'user_analytics',
  };
  
  assertCreateSchema(query);
});

Deno.test('CREATE_SCHEMA - valid schema starting with underscore', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: '_private_schema',
  };
  
  assertCreateSchema(query);
});

Deno.test('CREATE_SCHEMA - valid schema with numbers', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'analytics_v2',
  };
  
  assertCreateSchema(query);
});

Deno.test('CREATE_SCHEMA - valid schema at max length (63 chars)', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'a'.repeat(63),
  };
  
  assertCreateSchema(query);
});

//#endregion

//#region Invalid Type

Deno.test('CREATE_SCHEMA - throws on wrong type', () => {
  const query = {
    type: 'CREATE_TABLE' as any,
    schema: 'analytics',
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    "type must be 'CREATE_SCHEMA'",
  );
});

//#endregion

//#region Invalid Schema Name

Deno.test('CREATE_SCHEMA - throws on missing schema', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
  } as any;
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'schema name is required',
  );
});

Deno.test('CREATE_SCHEMA - throws on empty schema name', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: '',
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'schema name cannot be empty',
  );
});

Deno.test('CREATE_SCHEMA - throws on whitespace-only schema name', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: '   ',
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'schema name cannot be empty or whitespace',
  );
});

Deno.test('CREATE_SCHEMA - throws on non-string schema', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 123 as any,
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'schema must be a string',
  );
});

Deno.test('CREATE_SCHEMA - throws on schema starting with number', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: '2analytics',
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'must start with a letter or underscore',
  );
});

Deno.test('CREATE_SCHEMA - throws on schema with special characters', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'user-analytics',
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'contain only alphanumeric characters and underscores',
  );
});

Deno.test('CREATE_SCHEMA - throws on schema with spaces', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'user analytics',
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'contain only alphanumeric characters and underscores',
  );
});

Deno.test('CREATE_SCHEMA - throws on schema with dots', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'user.analytics',
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'contain only alphanumeric characters and underscores',
  );
});

Deno.test('CREATE_SCHEMA - throws on schema exceeding max length', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'a'.repeat(64),
  };
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'exceeds maximum length of 63 characters',
  );
});

//#endregion

//#region Invalid Extra Properties

Deno.test('CREATE_SCHEMA - throws on unexpected property', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'analytics',
    extra: 'not allowed',
  } as any;
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'unexpected properties: extra',
  );
});

Deno.test('CREATE_SCHEMA - throws on multiple unexpected properties', () => {
  const query = {
    type: 'CREATE_SCHEMA' as const,
    schema: 'analytics',
    cascade: true,
    ifNotExists: true,
  } as any;
  
  assertThrows(
    () => assertCreateSchema(query),
    TypeError,
    'unexpected properties',
  );
});

//#endregion
