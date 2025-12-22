/**
 * Schema Query Validator Tests
 *
 * Comprehensive test suite for CREATE_SCHEMA and DROP_SCHEMA query validators.
 *
 * @module asserts/Query/DDL/Schema.test
 */

import * as asserts from '$asserts';
import { assertCreateSchema, assertDropSchema } from './Schema.ts';

Deno.test('oql.asserts.Query.DDL.Schema', async (t) => {
  await t.step('CREATE_SCHEMA queries', async (u) => {
    await u.step('valid queries', async (v) => {
      await v.step('simple schema', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'analytics',
        };
        assertCreateSchema(query);
      });

      await v.step('schema with underscores', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'user_analytics',
        };
        assertCreateSchema(query);
      });

      await v.step('schema starting with underscore', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: '_private_schema',
        };
        assertCreateSchema(query);
      });

      await v.step('schema with numbers', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'analytics_v2',
        };
        assertCreateSchema(query);
      });

      await v.step('schema at max length (63 chars)', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'a'.repeat(63),
        };
        assertCreateSchema(query);
      });

      await v.step('SQL keywords as schema names', () => {
        const sqlKeywords = ['select', 'from', 'where', 'join', 'table'];
        for (const keyword of sqlKeywords) {
          const query = {
            type: 'CREATE_SCHEMA' as const,
            schema: keyword,
          };
          assertCreateSchema(query);
        }
      });

      await v.step('schema with only underscores', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: '____',
        };
        assertCreateSchema(query);
      });

      await v.step('mixed case and numbers', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'MySchema_v2_TEST',
        };
        assertCreateSchema(query);
      });
    });

    await u.step('invalid type', async (v) => {
      await v.step('wrong type', () => {
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

      await v.step('type validation', () => {
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

    await u.step('invalid schema name', async (v) => {
      await v.step('missing schema', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
        } as any;
        asserts.assertThrows(
          () => assertCreateSchema(query),
          TypeError,
          'schema name is required',
        );
      });

      await v.step('empty schema name', () => {
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

      await v.step('whitespace-only schema name', () => {
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

      await v.step('non-string schema', () => {
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

      await v.step('schema starting with number', () => {
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

      await v.step('schema with special characters (hyphen)', () => {
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

      await v.step('schema with spaces', () => {
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

      await v.step('schema with dots', () => {
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

      await v.step('schema exceeding max length', () => {
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

      await v.step('Unicode characters', () => {
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

    await u.step('invalid properties', async (v) => {
      await v.step('unexpected property', () => {
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

      await v.step('multiple unexpected properties', () => {
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

    await u.step('edge cases', async (v) => {
      await v.step('case-sensitive schema names', () => {
        const schemas = ['Analytics', 'analytics', 'ANALYTICS'];
        for (const schema of schemas) {
          const query = {
            type: 'CREATE_SCHEMA' as const,
            schema,
          };
          assertCreateSchema(query);
        }
      });

      await v.step('schema names at boundary length (63)', () => {
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

  await t.step('DROP_SCHEMA queries', async (u) => {
    await u.step('valid queries', async (v) => {
      await v.step('simple schema', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
        };
        assertDropSchema(query);
      });

      await v.step('without cascade', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'test_analytics',
        };
        assertDropSchema(query);
      });

      await v.step('with cascade false', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
          cascade: false,
        };
        assertDropSchema(query);
      });

      await v.step('with cascade true', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
          cascade: true,
        };
        assertDropSchema(query);
      });

      await v.step('schema with underscores', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'user_analytics',
        };
        assertDropSchema(query);
      });

      await v.step('schema starting with underscore', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: '_private_schema',
          cascade: true,
        };
        assertDropSchema(query);
      });

      await v.step('schema with numbers', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics_v2',
        };
        assertDropSchema(query);
      });

      await v.step('schema at max length (63 chars)', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'a'.repeat(63),
        };
        assertDropSchema(query);
      });
    });

    await u.step('invalid type', async (v) => {
      await v.step('wrong type', () => {
        const query = {
          type: 'DROP_TABLE' as any,
          schema: 'analytics',
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          "type must be 'DROP_SCHEMA'",
        );
      });

      await v.step('type validation', () => {
        const query = {
          type: 'CREATE_SCHEMA' as any,
          schema: 'test_analytics',
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'type must be',
        );
      });
    });

    await u.step('invalid schema name', async (v) => {
      await v.step('missing schema', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
        } as any;
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'schema name is required',
        );
      });

      await v.step('empty schema name', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: '',
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'schema name cannot be empty',
        );
      });

      await v.step('whitespace-only schema name', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: '   ',
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'schema name cannot be empty or whitespace',
        );
      });

      await v.step('non-string schema', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 123 as any,
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'schema must be a string',
        );
      });

      await v.step('schema starting with number', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: '2analytics',
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'must start with a letter or underscore',
        );
      });

      await v.step('schema with special characters', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'user-analytics',
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'contain only alphanumeric characters and underscores',
        );
      });

      await v.step('schema with spaces', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'user analytics',
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'contain only alphanumeric characters and underscores',
        );
      });

      await v.step('schema with dots', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'user.analytics',
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'contain only alphanumeric characters and underscores',
        );
      });

      await v.step('schema exceeding max length', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'a'.repeat(64),
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'exceeds maximum length of 63 characters',
        );
      });
    });

    await u.step('invalid cascade property', async (v) => {
      await v.step('non-boolean cascade', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
          cascade: 'yes' as any,
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'cascade must be a boolean',
        );
      });

      await v.step('numeric cascade', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
          cascade: 1 as any,
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'cascade must be a boolean',
        );
      });

      await v.step('cascade type', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'test_analytics',
          cascade: 'yes' as any,
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'cascade must be a boolean',
        );
      });
    });

    await u.step('invalid properties', async (v) => {
      await v.step('unexpected property', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
          extra: 'not allowed',
        } as any;
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'unexpected properties: extra',
        );
      });

      await v.step('multiple unexpected properties', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
          ifExists: true,
          table: 'users',
        } as any;
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'unexpected properties',
        );
      });
    });

    await u.step('edge cases', async (v) => {
      await v.step('case-sensitive names', () => {
        const schemas = ['Analytics', 'analytics', 'ANALYTICS'];
        for (const schema of schemas) {
          const query = {
            type: 'DROP_SCHEMA' as const,
            schema,
          };
          assertDropSchema(query);
        }
      });

      await v.step('Unicode characters rejected', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'schéma_français',
        };
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'alphanumeric characters and underscores',
        );
      });

      await v.step('boundary length (63)', () => {
        const query63 = {
          type: 'DROP_SCHEMA' as const,
          schema: 'a'.repeat(63),
        };
        const query64 = {
          type: 'DROP_SCHEMA' as const,
          schema: 'a'.repeat(64),
        };

        assertDropSchema(query63);
        asserts.assertThrows(
          () => assertDropSchema(query64),
          TypeError,
          'exceeds maximum length',
        );
      });
    });
  });
});
