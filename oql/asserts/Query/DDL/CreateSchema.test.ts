/**
 * CREATE_SCHEMA Query Validator Tests
 *
 * Comprehensive test suite for CREATE_SCHEMA query validator.
 *
 * @module asserts/Query/DDL/CreateSchema.test
 */

import * as asserts from '$asserts';
import { assertCreateSchema } from './CreateSchema.ts';

Deno.test('oql.asserts.Query.DDL.CreateSchema', async (t) => {
  await t.step('valid queries', async (u) => {
    await u.step('simple schema', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'analytics',
      };
      assertCreateSchema(query);
    });

    await u.step('schema with underscores', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'user_analytics',
      };
      assertCreateSchema(query);
    });

    await u.step('schema starting with underscore', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: '_private_schema',
      };
      assertCreateSchema(query);
    });

    await u.step('schema with numbers', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'analytics_v2',
      };
      assertCreateSchema(query);
    });

    await u.step('schema at max length (63 chars)', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'a'.repeat(63),
      };
      assertCreateSchema(query);
    });

    await u.step('SQL keywords as schema names', () => {
      const sqlKeywords = ['select', 'from', 'where', 'join', 'table'];
      for (const keyword of sqlKeywords) {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: keyword,
        };
        assertCreateSchema(query);
      }
    });

    await u.step('schema with only underscores', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: '____',
      };
      assertCreateSchema(query);
    });

    await u.step('mixed case and numbers', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'MySchema_v2_TEST',
      };
      assertCreateSchema(query);
    });
  });

  await t.step('invalid type', async (u) => {
    await u.step('wrong type', () => {
      const query = {
        type: 'CREATE_TABLE' as any,
        schema: 'analytics',
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        "type must be 'CREATE_SCHEMA'",
      );
    });

    await u.step('type validation', () => {
      const query = {
        type: 'DROP_SCHEMA' as any,
        schema: 'test_analytics',
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'type must be',
      );
    });
  });

  await t.step('invalid schema name', async (u) => {
    await u.step('missing schema', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
      } as any;
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'schema name is required',
      );
    });

    await u.step('empty schema name', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: '',
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'schema name cannot be empty',
      );
    });

    await u.step('whitespace-only schema name', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: '   ',
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'schema name cannot be empty or whitespace',
      );
    });

    await u.step('non-string schema', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 123 as any,
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'schema must be a string',
      );
    });

    await u.step('schema starting with number', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: '2analytics',
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'must start with a letter or underscore',
      );
    });

    await u.step('schema with special characters (hyphen)', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'user-analytics',
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'contain only alphanumeric characters and underscores',
      );
    });

    await u.step('schema with spaces', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'user analytics',
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'contain only alphanumeric characters and underscores',
      );
    });

    await u.step('schema with dots', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'user.analytics',
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'contain only alphanumeric characters and underscores',
      );
    });

    await u.step('schema exceeding max length', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'a'.repeat(64),
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'exceeds maximum length of 63 characters',
      );
    });

    await u.step('Unicode characters', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'schéma_français',
      };
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'alphanumeric characters and underscores',
      );
    });
  });

  await t.step('invalid properties', async (u) => {
    await u.step('unexpected property', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'analytics',
        extra: 'not allowed',
      } as any;
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'unexpected properties: extra',
      );
    });

    await u.step('multiple unexpected properties', () => {
      const query = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'analytics',
        cascade: true,
        ifNotExists: true,
      } as any;
      asserts.assertThrows(
        () => assertCreateSchema(query),
        TypeError,
        'unexpected properties',
      );
    });
  });

  await t.step('edge cases', async (u) => {
    await u.step('case-sensitive schema names', () => {
      const schemas = ['Analytics', 'analytics', 'ANALYTICS'];
      for (const schema of schemas) {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema,
        };
        assertCreateSchema(query);
      }
    });

    await u.step('schema names at boundary length (63)', () => {
      const query63 = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'a'.repeat(63),
      };
      const query64 = {
        type: 'CREATE_SCHEMA' as const,
        schema: 'a'.repeat(64),
      };

      assertCreateSchema(query63);
      asserts.assertThrows(
        () => assertCreateSchema(query64),
        TypeError,
        'exceeds maximum length',
      );
    });
  });
});
