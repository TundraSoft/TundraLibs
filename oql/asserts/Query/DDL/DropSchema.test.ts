/**
 * DROP_SCHEMA Query Validator Tests
 *
 * Comprehensive test suite for DROP_SCHEMA query validator.
 *
 * @module asserts/Query/DDL/DropSchema.test
 */

import * as asserts from '$asserts';
import { assertDropSchema } from './DropSchema.ts';

Deno.test('oql.asserts.Query.DDL.DropSchema', async (t) => {
  await t.step('valid queries', async (u) => {
    await u.step('simple schema', () => {
      const query = {
        type: 'DROP_SCHEMA' as const,
        schema: 'analytics',
      };
      assertDropSchema(query);
    });

    await u.step('without cascade', () => {
      const query = {
        type: 'DROP_SCHEMA' as const,
        schema: 'test_analytics',
      };
      assertDropSchema(query);
    });

    await u.step('with cascade false', () => {
      const query = {
        type: 'DROP_SCHEMA' as const,
        schema: 'analytics',
        cascade: false,
      };
      assertDropSchema(query);
    });

    await u.step('with cascade true', () => {
      const query = {
        type: 'DROP_SCHEMA' as const,
        schema: 'analytics',
        cascade: true,
      };
      assertDropSchema(query);
    });

    await u.step('schema with underscores', () => {
      const query = {
        type: 'DROP_SCHEMA' as const,
        schema: 'user_analytics',
      };
      assertDropSchema(query);
    });

    await u.step('schema starting with underscore', () => {
      const query = {
        type: 'DROP_SCHEMA' as const,
        schema: '_private_schema',
        cascade: true,
      };
      assertDropSchema(query);
    });

    await u.step('schema with numbers', () => {
      const query = {
        type: 'DROP_SCHEMA' as const,
        schema: 'analytics_v2',
      };
      assertDropSchema(query);
    });

    await u.step('schema at max length (63 chars)', () => {
      const query = {
        type: 'DROP_SCHEMA' as const,
        schema: 'a'.repeat(63),
      };
      assertDropSchema(query);
    });
  });

  await t.step('invalid type', async (u) => {
    await u.step('wrong type', () => {
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

    await u.step('type validation', () => {
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

  await t.step('invalid schema name', async (u) => {
    await u.step('missing schema', () => {
      const query = {
        type: 'DROP_SCHEMA' as const,
      } as any;
      asserts.assertThrows(
        () => assertDropSchema(query),
        TypeError,
        'schema name is required',
      );
    });

    await u.step('empty schema name', () => {
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

    await u.step('whitespace-only schema name', () => {
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

    await u.step('non-string schema', () => {
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

    await u.step('schema starting with number', () => {
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

    await u.step('schema with special characters', () => {
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

    await u.step('schema with spaces', () => {
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

    await u.step('schema with dots', () => {
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

    await u.step('schema exceeding max length', () => {
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

  await t.step('invalid cascade property', async (u) => {
    await u.step('non-boolean cascade', () => {
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

    await u.step('numeric cascade', () => {
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

    await u.step('cascade type', () => {
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

  await t.step('invalid properties', async (u) => {
    await u.step('unexpected property', () => {
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

    await u.step('multiple unexpected properties', () => {
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

  await t.step('edge cases', async (u) => {
    await u.step('case-sensitive names', () => {
      const schemas = ['Analytics', 'analytics', 'ANALYTICS'];
      for (const schema of schemas) {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema,
        };
        assertDropSchema(query);
      }
    });

    await u.step('Unicode characters rejected', () => {
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

    await u.step('boundary length (63)', () => {
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
