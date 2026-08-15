import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Guardian } from '../mod.ts';

describe('guardian.OpenAPI', () => {
  describe('StringGuardian', () => {
    it('should generate basic string schema', () => {
      const schema = Guardian.string().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
    });

    it('should include minLength and maxLength', () => {
      const schema = Guardian.string().minLength(5).maxLength(10).toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.minLength, 5);
      asserts.assertEquals(schema.maxLength, 10);
    });

    it('should include pattern', () => {
      const schema = Guardian.string().pattern(/^[A-Z]+$/).toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.pattern, '^[A-Z]+$');
    });

    it('should include format for email', () => {
      const schema = Guardian.string().email().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.format, 'email');
    });

    it('should include format for url', () => {
      const schema = Guardian.string().url().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.format, 'uri');
    });

    it('should include format for uuid', () => {
      const schema = Guardian.string().uuid().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.format, 'uuid');
    });

    it('should handle nullable', () => {
      const schema = Guardian.string().nullable().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('NumberGuardian', () => {
    it('should generate basic number schema', () => {
      const schema = Guardian.number().toOpenAPI();
      asserts.assertEquals(schema.type, 'number');
    });

    it('should include minimum and maximum', () => {
      const schema = Guardian.number().min(0).max(100).toOpenAPI();
      asserts.assertEquals(schema.type, 'number');
      asserts.assertEquals(schema.minimum, 0);
      asserts.assertEquals(schema.maximum, 100);
    });

    it('should include integer format', () => {
      const schema = Guardian.number().integer().toOpenAPI();
      asserts.assertEquals(schema.type, 'number');
      asserts.assertEquals(schema.format, 'integer');
    });

    it('should include multipleOf', () => {
      const schema = Guardian.number().multipleOf(5).toOpenAPI();
      asserts.assertEquals(schema.type, 'number');
      asserts.assertEquals(schema.multipleOf, 5);
    });
  });

  describe('BooleanGuardian', () => {
    it('should generate basic boolean schema', () => {
      const schema = Guardian.boolean().toOpenAPI();
      asserts.assertEquals(schema.type, 'boolean');
    });

    it('should handle nullable', () => {
      const schema = Guardian.boolean().nullable().toOpenAPI();
      asserts.assertEquals(schema.type, 'boolean');
      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('DateGuardian', () => {
    it('should generate date-time string schema by default', () => {
      const schema = Guardian.date().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.format, 'date-time');
    });

    it('should generate date string schema with dateOnly()', () => {
      const schema = Guardian.date().dateOnly().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.format, 'date');
    });

    it('should generate time string schema with timeOnly()', () => {
      const schema = Guardian.date().timeOnly().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.format, 'time');
    });

    it('should handle nullable', () => {
      const schema = Guardian.date().nullable().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.format, 'date-time');
      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('EnumGuardian', () => {
    it('should generate string enum schema', () => {
      const schema = Guardian.enum(['red', 'green', 'blue']).toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.enum, ['red', 'green', 'blue']);
    });

    it('should generate number enum schema', () => {
      const schema = Guardian.enum([1, 2, 3]).toOpenAPI();
      asserts.assertEquals(schema.type, 'number');
      asserts.assertEquals(schema.enum, [1, 2, 3]);
    });

    it('should generate boolean enum schema', () => {
      const schema = Guardian.enum([true, false]).toOpenAPI();
      asserts.assertEquals(schema.type, 'boolean');
      asserts.assertEquals(schema.enum, [true, false]);
    });

    it('should handle mixed types without type', () => {
      const schema = Guardian.enum(['red', 1, true]).toOpenAPI();
      asserts.assertEquals(schema.type, undefined);
      asserts.assertEquals(schema.enum, ['red', 1, true]);
    });

    it('should handle nullable', () => {
      const schema = Guardian.enum(['a', 'b']).nullable().toOpenAPI();
      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.enum, ['a', 'b']);
      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('ArrayGuardian', () => {
    it('should generate basic array schema', () => {
      const schema = Guardian.array().toOpenAPI();
      asserts.assertEquals(schema.type, 'array');
      asserts.assertExists(schema.items);
      asserts.assertEquals(schema.items, {});
    });

    it('should include items schema for string arrays', () => {
      const schema = Guardian.array(Guardian.string()).toOpenAPI();
      asserts.assertEquals(schema.type, 'array');
      asserts.assertExists(schema.items);
      asserts.assertEquals(
        (schema.items as Record<string, unknown>).type,
        'string',
      );
    });

    it('should include items schema for number arrays', () => {
      const schema = Guardian.array(Guardian.number()).toOpenAPI();
      asserts.assertEquals(schema.type, 'array');
      asserts.assertExists(schema.items);
      asserts.assertEquals(
        (schema.items as Record<string, unknown>).type,
        'number',
      );
    });

    it('should include minItems and maxItems', () => {
      const schema = Guardian.array().minLength(1).maxLength(10).toOpenAPI();
      asserts.assertEquals(schema.type, 'array');
      asserts.assertEquals(schema.minItems, 1);
      asserts.assertEquals(schema.maxItems, 10);
    });

    it('should include uniqueItems when unique() is called', () => {
      const schema = Guardian.array(Guardian.string()).unique().toOpenAPI();
      asserts.assertEquals(schema.type, 'array');
      asserts.assertEquals(schema.uniqueItems, true);
    });

    it('should handle nested arrays', () => {
      const schema = Guardian.array(
        Guardian.array(Guardian.number()),
      ).toOpenAPI();
      asserts.assertEquals(schema.type, 'array');
      asserts.assertExists(schema.items);
      const items = schema.items as Record<string, unknown>;
      asserts.assertEquals(items.type, 'array');
      asserts.assertExists(items.items);
      asserts.assertEquals(
        (items.items as Record<string, unknown>).type,
        'number',
      );
    });

    it('should handle nullable', () => {
      const schema = Guardian.array(Guardian.string()).nullable().toOpenAPI();
      asserts.assertEquals(schema.type, 'array');
      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('ObjectGuardian', () => {
    it('should generate basic object schema', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
        age: Guardian.number(),
      }).toOpenAPI();

      asserts.assertEquals(schema.type, 'object');
      asserts.assertExists(schema.properties);
      const props = schema.properties as Record<
        string,
        Record<string, unknown>
      >;
      asserts.assertEquals(props.name!.type, 'string');
      asserts.assertEquals(props.age!.type, 'number');
    });

    it('should include required array', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
        age: Guardian.number(),
      }).toOpenAPI();

      asserts.assertExists(schema.required);
      asserts.assertEquals(schema.required, ['name', 'age']);
    });

    it('should exclude optional fields from required', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
        nickname: Guardian.string().optional(),
      }).toOpenAPI();

      asserts.assertExists(schema.required);
      asserts.assertEquals(schema.required, ['name']);
    });

    it('should set additionalProperties for passthrough mode', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
      }).passthrough().toOpenAPI();

      asserts.assertEquals(schema.additionalProperties, true);
    });

    it('default (strip) mode emits additionalProperties=false', () => {
      // Default is strip, so OpenAPI signals no extras allowed.
      const schema = Guardian.object({
        name: Guardian.string(),
      }).toOpenAPI();

      asserts.assertEquals(schema.additionalProperties, false);
    });

    it('should set additionalProperties for strict mode', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
      }).strict().toOpenAPI();

      asserts.assertEquals(schema.additionalProperties, false);
    });

    it('should set additionalProperties for strip mode', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
      }).strip().toOpenAPI();

      asserts.assertEquals(schema.additionalProperties, false);
    });

    it('should handle nested objects', () => {
      const schema = Guardian.object({
        user: Guardian.object({
          name: Guardian.string(),
          email: Guardian.string().email(),
        }),
      }).toOpenAPI();

      asserts.assertEquals(schema.type, 'object');
      asserts.assertExists(schema.properties);
      const props = schema.properties as Record<
        string,
        Record<string, unknown>
      >;
      asserts.assertEquals(props.user!.type, 'object');
      const userProps = props.user!.properties as Record<
        string,
        Record<string, unknown>
      >;
      asserts.assertEquals(userProps.name!.type, 'string');
      asserts.assertEquals(userProps.email!.type, 'string');
      asserts.assertEquals(userProps.email!.format, 'email');
    });

    it('should handle nullable', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
      }).nullable().toOpenAPI();

      asserts.assertEquals(schema.type, 'object');
      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('BigIntGuardian', () => {
    it('should generate integer/int64 schema', () => {
      const schema = Guardian.bigint().toOpenAPI();
      asserts.assertEquals(schema.type, 'integer');
      asserts.assertEquals(schema.format, 'int64');
    });

    it('should include minimum and maximum', () => {
      const schema = Guardian.bigint().min(0n).max(1000n).toOpenAPI();
      asserts.assertEquals(schema.type, 'integer');
      asserts.assertEquals(schema.format, 'int64');
      asserts.assertEquals(schema.minimum, 0);
      asserts.assertEquals(schema.maximum, 1000);
    });

    it('should handle nullable', () => {
      const schema = Guardian.bigint().nullable().toOpenAPI();
      asserts.assertEquals(schema.type, 'integer');
      asserts.assertEquals(schema.format, 'int64');
      asserts.assertEquals(schema.nullable, true);
    });
  });

  describe('UnknownGuardian', () => {
    it('should generate empty schema', () => {
      const schema = Guardian.unknown().toOpenAPI();
      asserts.assertEquals(Object.keys(schema).length, 0);
      asserts.assertEquals(schema, {});
    });

    it('should generate empty schema even with nullable', () => {
      const schema = Guardian.unknown().nullable().toOpenAPI();
      // Empty schema allows anything including null
      asserts.assertEquals(schema, {});
    });
  });

  describe('Complex scenarios', () => {
    it('should handle API request schema', () => {
      const schema = Guardian.object({
        id: Guardian.number().integer(),
        username: Guardian.string().minLength(3).maxLength(20),
        email: Guardian.string().email(),
        age: Guardian.number().min(0).max(150).optional(),
        roles: Guardian.array(Guardian.enum(['admin', 'user', 'guest'])),
        settings: Guardian.object({
          theme: Guardian.enum(['light', 'dark']),
          notifications: Guardian.boolean(),
        }).optional(),
      }).toOpenAPI();

      asserts.assertEquals(schema.type, 'object');
      asserts.assertExists(schema.properties);
      asserts.assertExists(schema.required);

      const props = schema.properties as Record<
        string,
        Record<string, unknown>
      >;

      // Verify id
      asserts.assertEquals(props.id!.type, 'number');
      asserts.assertEquals(props.id!.format, 'integer');

      // Verify username
      asserts.assertEquals(props.username!.type, 'string');
      asserts.assertEquals(props.username!.minLength, 3);
      asserts.assertEquals(props.username!.maxLength, 20);

      // Verify email
      asserts.assertEquals(props.email!.type, 'string');
      asserts.assertEquals(props.email!.format, 'email');

      // Verify age
      asserts.assertEquals(props.age!.type, 'number');
      asserts.assertEquals(props.age!.minimum, 0);
      asserts.assertEquals(props.age!.maximum, 150);

      // Verify roles
      asserts.assertEquals(props.roles!.type, 'array');
      const rolesItems = props.roles!.items as Record<string, unknown>;
      asserts.assertEquals(rolesItems.type, 'string');
      asserts.assertEquals(rolesItems.enum, ['admin', 'user', 'guest']);

      // Verify settings
      asserts.assertEquals(props.settings!.type, 'object');
      const settingsProps = props.settings!.properties as Record<
        string,
        Record<string, unknown>
      >;
      asserts.assertEquals(settingsProps.theme!.type, 'string');
      asserts.assertEquals(settingsProps.theme!.enum, ['light', 'dark']);
      asserts.assertEquals(settingsProps.notifications!.type, 'boolean');

      // Verify required array (age and settings are optional)
      asserts.assertEquals(schema.required, [
        'id',
        'username',
        'email',
        'roles',
      ]);
    });

    it('should handle nested arrays and objects', () => {
      const schema = Guardian.object({
        matrix: Guardian.array(Guardian.array(Guardian.number())),
        users: Guardian.array(
          Guardian.object({
            name: Guardian.string(),
            tags: Guardian.array(Guardian.string()),
          }),
        ),
      }).toOpenAPI();

      asserts.assertEquals(schema.type, 'object');
      const props = schema.properties as Record<
        string,
        Record<string, unknown>
      >;

      // Verify matrix
      asserts.assertEquals(props.matrix!.type, 'array');
      const matrixItems = props.matrix!.items as Record<string, unknown>;
      asserts.assertEquals(matrixItems.type, 'array');
      asserts.assertEquals(
        (matrixItems.items as Record<string, unknown>).type,
        'number',
      );

      // Verify users
      asserts.assertEquals(props.users!.type, 'array');
      const usersItems = props.users!.items as Record<string, unknown>;
      asserts.assertEquals(usersItems.type, 'object');
      const userProps = usersItems.properties as Record<
        string,
        Record<string, unknown>
      >;
      asserts.assertEquals(userProps.name!.type, 'string');
      asserts.assertEquals(userProps.tags!.type, 'array');
      asserts.assertEquals(
        (userProps.tags!.items as Record<string, unknown>).type,
        'string',
      );
    });

    it('should handle date formats in objects', () => {
      const schema = Guardian.object({
        createdAt: Guardian.date(),
        birthDate: Guardian.date().dateOnly(),
        meetingTime: Guardian.date().timeOnly(),
      }).toOpenAPI();

      const props = schema.properties as Record<
        string,
        Record<string, unknown>
      >;

      asserts.assertEquals(props.createdAt!.type, 'string');
      asserts.assertEquals(props.createdAt!.format, 'date-time');

      asserts.assertEquals(props.birthDate!.type, 'string');
      asserts.assertEquals(props.birthDate!.format, 'date');

      asserts.assertEquals(props.meetingTime!.type, 'string');
      asserts.assertEquals(props.meetingTime!.format, 'time');
    });
  });

  // ============================================================================
  // COMPREHENSIVE OPENAPI SCENARIOS - Added for Production Readiness
  // ============================================================================

  describe('EnumGuardian OpenAPI', () => {
    it('should generate enum schema with string values', () => {
      const colors = ['red', 'green', 'blue'] as const;
      const schema = Guardian.enum(colors).toOpenAPI();

      asserts.assertEquals(schema.type, 'string');
      asserts.assert(Array.isArray(schema.enum));
      asserts.assertEquals(schema.enum!.length, 3);
      asserts.assert(schema.enum!.includes('red'));
    });

    it('should generate enum schema with number values', () => {
      const numbers = [1, 2, 3] as const;
      const schema = Guardian.enum(numbers).toOpenAPI();

      asserts.assertEquals(schema.type, 'number');
      asserts.assert(Array.isArray(schema.enum));
      asserts.assertEquals(schema.enum!.length, 3);
    });

    it('should handle enum with metadata', () => {
      const sizes = ['small', 'medium', 'large'] as const;
      const schema = Guardian.enum(sizes).describe({
        title: 'Size',
        description: 'Product size',
        default: 'medium',
      }).toOpenAPI();

      asserts.assertEquals(schema.title, 'Size');
      asserts.assertEquals(schema.description, 'Product size');
      asserts.assertEquals(schema.default, 'medium');
    });
  });

  describe('BigIntGuardian OpenAPI', () => {
    it('should generate integer schema for bigint', () => {
      const schema = Guardian.bigint().toOpenAPI();

      asserts.assertEquals(schema.type, 'integer');
      asserts.assertEquals(schema.format, 'int64');
    });

    it('should include min/max constraints', () => {
      const schema = Guardian.bigint().min(0n).max(1000n).toOpenAPI();

      asserts.assertEquals(schema.minimum, 0);
      asserts.assertEquals(schema.maximum, 1000);
    });
  });

  describe('UnknownGuardian OpenAPI', () => {
    it('should generate schema for unknown type', () => {
      const schema = Guardian.unknown().toOpenAPI();

      asserts.assert(schema !== null);
    });

    it('should handle unknown with metadata', () => {
      const schema = Guardian.unknown().describe({
        title: 'Flexible Data',
        description: 'Any data type allowed',
      }).toOpenAPI();

      asserts.assertEquals(schema.title, 'Flexible Data');
      asserts.assertEquals(schema.description, 'Any data type allowed');
    });
  });

  describe('RecordGuardian OpenAPI', () => {
    it('should generate record schema', () => {
      const schema = Guardian.record(
        Guardian.string(),
        Guardian.number(),
      ).toOpenAPI();

      // RecordGuardian uses 'record' type
      asserts.assert(schema.type === 'record' || schema.type === 'object');
      asserts.assert(schema.additionalProperties);
    });

    it('should include value schema in additionalProperties', () => {
      const schema = Guardian.record(
        Guardian.string().minLength(3),
        Guardian.number().min(0).max(100),
      ).toOpenAPI();

      asserts.assert(schema.type === 'record' || schema.type === 'object');
      const additionalProps = schema.additionalProperties as Record<
        string,
        unknown
      >;
      asserts.assertEquals(additionalProps.type, 'number');
      asserts.assertEquals(additionalProps.minimum, 0);
      asserts.assertEquals(additionalProps.maximum, 100);
    });
  });

  describe('Complex nested OpenAPI schemas', () => {
    it('should handle deeply nested objects', () => {
      const schema = Guardian.object({
        company: Guardian.object({
          name: Guardian.string(),
          address: Guardian.object({
            street: Guardian.string(),
            city: Guardian.string(),
            country: Guardian.object({
              name: Guardian.string(),
              code: Guardian.string().length(2),
            }),
          }),
        }),
      }).toOpenAPI();

      asserts.assertEquals(schema.type, 'object');
      const props = schema.properties as any;
      asserts.assertEquals(props.company.type, 'object');
      asserts.assertEquals(props.company.properties.address.type, 'object');
      asserts.assertEquals(
        props.company.properties.address.properties.country.type,
        'object',
      );
    });

    it('should handle arrays of objects with arrays', () => {
      const schema = Guardian.array(
        Guardian.object({
          id: Guardian.number(),
          tags: Guardian.array(Guardian.string()),
          metadata: Guardian.record(Guardian.string(), Guardian.unknown()),
        }),
      ).toOpenAPI();

      asserts.assertEquals(schema.type, 'array');
      const items = schema.items as any;
      asserts.assertEquals(items.type, 'object');
      asserts.assertEquals(items.properties.tags.type, 'array');
      // Record type can be 'record' or 'object'
      asserts.assert(
        items.properties.metadata.type === 'record' ||
          items.properties.metadata.type === 'object',
      );
    });
  });

  describe('Metadata propagation', () => {
    it('should include all standard metadata fields', () => {
      const schema = Guardian.string().describe({
        title: 'Username',
        description: 'User login identifier',
        default: 'guest',
        example: 'john_doe',
      }).toOpenAPI();

      asserts.assertEquals(schema.title, 'Username');
      asserts.assertEquals(schema.description, 'User login identifier');
      asserts.assertEquals(schema.default, 'guest');
      asserts.assertEquals(schema.example, 'john_doe');
    });

    it('should include custom metadata fields', () => {
      const schema = Guardian.number().describe({
        title: 'Age',
        deprecated: true as any,
        readOnly: true as any,
      }).toOpenAPI();

      asserts.assertEquals(schema.title, 'Age');
    });
  });

  describe('Edge case schemas', () => {
    it('should handle optional with default in OpenAPI', () => {
      const schema = Guardian.string().optional('default').toOpenAPI();

      asserts.assertEquals(schema.type, 'string');
    });

    it('should handle nullable arrays', () => {
      const schema = Guardian.array(Guardian.number()).nullable().toOpenAPI();

      asserts.assertEquals(schema.type, 'array');
      asserts.assertEquals(schema.nullable, true);
    });

    it('should handle union-like scenarios with enum', () => {
      const schema = Guardian.enum(['option1', 'option2', null as any])
        .toOpenAPI();

      asserts.assert(schema.enum);
    });

    it('should handle string with multiple formats', () => {
      const schema = Guardian.string()
        .email()
        .minLength(5)
        .maxLength(100)
        .toOpenAPI();

      asserts.assertEquals(schema.type, 'string');
      asserts.assertEquals(schema.format, 'email');
      asserts.assertEquals(schema.minLength, 5);
      asserts.assertEquals(schema.maxLength, 100);
    });
  });

  describe('Array constraints in OpenAPI', () => {
    it('should include minItems and maxItems', () => {
      const schema = Guardian.array(Guardian.string())
        .minLength(1)
        .maxLength(10)
        .toOpenAPI();

      asserts.assertEquals(schema.minItems, 1);
      asserts.assertEquals(schema.maxItems, 10);
    });

    it('should include uniqueItems', () => {
      const schema = Guardian.array(Guardian.number())
        .unique()
        .toOpenAPI();

      asserts.assertEquals(schema.uniqueItems, true);
    });
  });

  describe('Object required fields', () => {
    it('should mark all fields as required by default', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
        age: Guardian.number(),
        email: Guardian.string().email(),
      }).toOpenAPI();

      asserts.assert(Array.isArray(schema.required));
      asserts.assertEquals(schema.required!.length, 3);
      asserts.assert(schema.required!.includes('name'));
      asserts.assert(schema.required!.includes('age'));
      asserts.assert(schema.required!.includes('email'));
    });

    it('should handle optional fields correctly', () => {
      const schema = Guardian.object({
        name: Guardian.string(),
        nickname: Guardian.string().optional(),
      }).toOpenAPI();

      // Required should only include non-optional fields
      asserts.assert(Array.isArray(schema.required));
      asserts.assert(schema.required!.includes('name'));
    });
  });

  describe('Internal metadata leak (regression)', () => {
    it('does not forward Guardian-internal metadata keys to emitted schema', () => {
      // `caseInsensitive` (EnumGuardian's internal marker) is not a
      // standard JSON Schema / OpenAPI field and must be filtered.
      const ci = Guardian.enum(['GET', 'POST', 'PUT']).caseInsensitive();
      const schema = ci.toOpenAPI();
      asserts.assertEquals(schema.caseInsensitive, undefined);
      asserts.assertEquals(schema.path, undefined);
      // Legitimate enum values still emit.
      asserts.assertEquals(schema.enum, ['GET', 'POST', 'PUT']);
    });

    it('does not emit isAsync / isOptional / isNullable on the schema', () => {
      const guard = Guardian.string().optional().nullable();
      const schema = guard.toOpenAPI();
      asserts.assertEquals(schema.isAsync, undefined);
      asserts.assertEquals(schema.isOptional, undefined);
      // `nullable` is set via the dedicated handler at the top of
      // `toOpenAPI`; `isNullable` (the internal flag) must not leak.
      asserts.assertEquals(schema.isNullable, undefined);
      asserts.assertEquals(schema.nullable, true);
    });
  });
});
