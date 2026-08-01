/**
 * Schema Query Validator Tests
 *
 * Comprehensive test suite for CREATE_SCHEMA and DROP_SCHEMA query validators.
 *
 * @module asserts/Query/DDL/Schema.test
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  assertCreateSchema,
  assertDropSchema,
  isCreateSchema,
  isDropSchema,
} from './schema.ts';

describe('oql.asserts.Query.DDL.Schema', () => {
  describe('CREATE_SCHEMA queries', () => {
    describe('valid queries', () => {
      it('simple schema', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'analytics',
        };
        assertCreateSchema(query);
      });

      it('schema with underscores', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'user_analytics',
        };
        assertCreateSchema(query);
      });

      it('schema starting with underscore', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: '_private_schema',
        };
        assertCreateSchema(query);
      });

      it('schema with numbers', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'analytics_v2',
        };
        assertCreateSchema(query);
      });

      it('schema at max length (63 chars)', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'a'.repeat(63),
        };
        assertCreateSchema(query);
      });

      it('SQL keywords as schema names', () => {
        const sqlKeywords = ['select', 'from', 'where', 'join', 'table'];
        for (const keyword of sqlKeywords) {
          const query = {
            type: 'CREATE_SCHEMA' as const,
            schema: keyword,
          };
          assertCreateSchema(query);
        }
      });

      it('schema with only underscores', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: '____',
        };
        assertCreateSchema(query);
      });

      it('mixed case and numbers', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
          schema: 'MySchema_v2_TEST',
        };
        assertCreateSchema(query);
      });
    });

    describe('invalid type', () => {
      it('wrong type', () => {
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

      it('type validation', () => {
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

    describe('invalid schema name', () => {
      it('missing schema', () => {
        const query = {
          type: 'CREATE_SCHEMA' as const,
        } as any;
        asserts.assertThrows(
          () => assertCreateSchema(query),
          TypeError,
          'schema name is required',
        );
      });

      it('empty schema name', () => {
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

      it('whitespace-only schema name', () => {
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

      it('non-string schema', () => {
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

      it('schema starting with number', () => {
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

      it('schema with special characters (hyphen)', () => {
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

      it('schema with spaces', () => {
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

      it('schema with dots', () => {
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

      it('schema exceeding max length', () => {
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

      it('Unicode characters', () => {
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

    describe('invalid properties', () => {
      it('unexpected property', () => {
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

      it('multiple unexpected properties', () => {
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

    describe('edge cases', () => {
      it('case-sensitive schema names', () => {
        const schemas = ['Analytics', 'analytics', 'ANALYTICS'];
        for (const schema of schemas) {
          const query = {
            type: 'CREATE_SCHEMA' as const,
            schema,
          };
          assertCreateSchema(query);
        }
      });

      it('schema names at boundary length (63)', () => {
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

  describe('DROP_SCHEMA queries', () => {
    describe('valid queries', () => {
      it('simple schema', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
        };
        assertDropSchema(query);
      });

      it('without cascade', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'test_analytics',
        };
        assertDropSchema(query);
      });

      it('with cascade false', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
          cascade: false,
        };
        assertDropSchema(query);
      });

      it('with cascade true', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics',
          cascade: true,
        };
        assertDropSchema(query);
      });

      it('schema with underscores', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'user_analytics',
        };
        assertDropSchema(query);
      });

      it('schema starting with underscore', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: '_private_schema',
          cascade: true,
        };
        assertDropSchema(query);
      });

      it('schema with numbers', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'analytics_v2',
        };
        assertDropSchema(query);
      });

      it('schema at max length (63 chars)', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
          schema: 'a'.repeat(63),
        };
        assertDropSchema(query);
      });
    });

    describe('invalid type', () => {
      it('wrong type', () => {
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

      it('type validation', () => {
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

    describe('invalid schema name', () => {
      it('missing schema', () => {
        const query = {
          type: 'DROP_SCHEMA' as const,
        } as any;
        asserts.assertThrows(
          () => assertDropSchema(query),
          TypeError,
          'schema name is required',
        );
      });

      it('empty schema name', () => {
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

      it('whitespace-only schema name', () => {
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

      it('non-string schema', () => {
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

      it('schema starting with number', () => {
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

      it('schema with special characters', () => {
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

      it('schema with spaces', () => {
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

      it('schema with dots', () => {
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

      it('schema exceeding max length', () => {
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

    describe('invalid cascade property', () => {
      it('non-boolean cascade', () => {
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

      it('numeric cascade', () => {
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

      it('cascade type', () => {
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

    describe('invalid properties', () => {
      it('unexpected property', () => {
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

      it('multiple unexpected properties', () => {
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

    describe('edge cases', () => {
      it('case-sensitive names', () => {
        const schemas = ['Analytics', 'analytics', 'ANALYTICS'];
        for (const schema of schemas) {
          const query = {
            type: 'DROP_SCHEMA' as const,
            schema,
          };
          assertDropSchema(query);
        }
      });

      it('Unicode characters rejected', () => {
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

      it('boundary length (63)', () => {
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

  describe('Type Guards', () => {
    describe('isCreateSchema', () => {
      it('valid queries return true', () => {
        asserts.assertEquals(
          isCreateSchema({
            type: 'CREATE_SCHEMA',
            schema: 'analytics',
          }),
          true,
        );

        asserts.assertEquals(
          isCreateSchema({
            type: 'CREATE_SCHEMA',
            schema: 'user_analytics_v2',
          }),
          true,
        );

        asserts.assertEquals(
          isCreateSchema({
            type: 'CREATE_SCHEMA',
            schema: '_private',
          }),
          true,
        );
      });

      it('invalid queries return false', () => {
        // Wrong type
        asserts.assertEquals(
          isCreateSchema({
            type: 'DROP_SCHEMA',
            schema: 'analytics',
          }),
          false,
        );

        // Missing schema
        asserts.assertEquals(
          isCreateSchema({
            type: 'CREATE_SCHEMA',
          }),
          false,
        );

        // Invalid schema name
        asserts.assertEquals(
          isCreateSchema({
            type: 'CREATE_SCHEMA',
            schema: '123invalid',
          }),
          false,
        );

        // Not an object
        asserts.assertEquals(isCreateSchema('CREATE_SCHEMA'), false);
        asserts.assertEquals(isCreateSchema(null), false);
        asserts.assertEquals(isCreateSchema(undefined), false);
        asserts.assertEquals(isCreateSchema(123), false);

        // Extra properties
        asserts.assertEquals(
          isCreateSchema({
            type: 'CREATE_SCHEMA',
            schema: 'analytics',
            extraProp: 'value',
          }),
          false,
        );
      });

      it('type narrowing works correctly', () => {
        const query: unknown = {
          type: 'CREATE_SCHEMA',
          schema: 'test',
        };

        if (isCreateSchema(query)) {
          // TypeScript should narrow the type here
          asserts.assertEquals(query.type, 'CREATE_SCHEMA');
          asserts.assertEquals(query.schema, 'test');
        }
      });
    });

    describe('isDropSchema', () => {
      it('valid queries return true', () => {
        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: 'analytics',
          }),
          true,
        );

        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: 'analytics',
            cascade: true,
          }),
          true,
        );

        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: 'analytics',
            cascade: false,
          }),
          true,
        );

        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: '_private_schema',
          }),
          true,
        );
      });

      it('invalid queries return false', () => {
        // Wrong type
        asserts.assertEquals(
          isDropSchema({
            type: 'CREATE_SCHEMA',
            schema: 'analytics',
          }),
          false,
        );

        // Missing schema
        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
          }),
          false,
        );

        // Invalid schema name
        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: '123invalid',
          }),
          false,
        );

        // Invalid cascade type
        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: 'analytics',
            cascade: 'true',
          }),
          false,
        );

        // Not an object
        asserts.assertEquals(isDropSchema('DROP_SCHEMA'), false);
        asserts.assertEquals(isDropSchema(null), false);
        asserts.assertEquals(isDropSchema(undefined), false);
        asserts.assertEquals(isDropSchema(123), false);

        // Extra properties
        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: 'analytics',
            extraProp: 'value',
          }),
          false,
        );
      });

      it('type narrowing works correctly', () => {
        const query: unknown = {
          type: 'DROP_SCHEMA',
          schema: 'test',
          cascade: true,
        };

        if (isDropSchema(query)) {
          // TypeScript should narrow the type here
          asserts.assertEquals(query.type, 'DROP_SCHEMA');
          asserts.assertEquals(query.schema, 'test');
          asserts.assertEquals(query.cascade, true);
        }
      });

      it('handles optional cascade property', () => {
        // Without cascade
        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: 'test',
          }),
          true,
        );

        // With cascade = true
        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: 'test',
            cascade: true,
          }),
          true,
        );

        // With cascade = false
        asserts.assertEquals(
          isDropSchema({
            type: 'DROP_SCHEMA',
            schema: 'test',
            cascade: false,
          }),
          true,
        );
      });
    });
  });
});
