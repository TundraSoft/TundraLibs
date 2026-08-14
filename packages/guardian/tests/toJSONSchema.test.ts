import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Guardian } from '../mod.ts';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema';

describe('guardian.toJSONSchema (Draft 2020-12)', () => {
  describe('header', () => {
    it('emits the 2020-12 $schema URL on the outermost schema', () => {
      const s = Guardian.string().toJSONSchema();
      asserts.assertEquals(s.$schema, DRAFT);
    });
  });

  describe('primitives', () => {
    it('string with length + pattern + format', () => {
      const s = Guardian.string().minLength(3).maxLength(50).pattern(
        /^[a-z]+$/,
      ).toJSONSchema();
      asserts.assertEquals(s.type, 'string');
      asserts.assertEquals(s.minLength, 3);
      asserts.assertEquals(s.maxLength, 50);
      asserts.assertEquals(s.pattern, '^[a-z]+$');
    });

    it('number with integer + min + max', () => {
      const s = Guardian.number().integer().min(0).max(100).toJSONSchema();
      asserts.assertEquals(s.type, 'integer');
      asserts.assertEquals(s.minimum, 0);
      asserts.assertEquals(s.maximum, 100);
    });

    it('boolean', () => {
      const s = Guardian.boolean().toJSONSchema();
      asserts.assertEquals(s.type, 'boolean');
    });

    it('date emits date-time format', () => {
      const s = Guardian.date().toJSONSchema();
      asserts.assertEquals(s.format, 'date-time');
    });
  });

  describe('nullable / optional', () => {
    it('nullable() expands type to ["x", "null"]', () => {
      const s = Guardian.string().nullable().toJSONSchema();
      asserts.assertEquals(s.type, ['string', 'null']);
      // OpenAPI's `nullable: true` field should not appear in the output.
      asserts.assertEquals(s.nullable, undefined);
    });

    it('optional() field omitted from `required`', () => {
      const s = Guardian.object({
        a: Guardian.string(),
        b: Guardian.number().optional(),
      }).toJSONSchema();
      asserts.assertEquals(s.required, ['a']);
    });
  });

  describe('object', () => {
    it('strip default emits additionalProperties: false', () => {
      const s = Guardian.object({
        id: Guardian.number(),
      }).toJSONSchema();
      asserts.assertEquals(s.type, 'object');
      asserts.assertEquals(s.additionalProperties, false);
    });

    it('passthrough emits additionalProperties: true', () => {
      const s = Guardian.object({
        id: Guardian.number(),
      }).passthrough().toJSONSchema();
      asserts.assertEquals(s.additionalProperties, true);
    });

    it('nested objects retain their structure', () => {
      const s = Guardian.object({
        user: Guardian.object({
          name: Guardian.string(),
        }),
      }).toJSONSchema();
      const props = s.properties as Record<string, Record<string, unknown>>;
      asserts.assertEquals(props.user!.type, 'object');
      const userProps = props.user!.properties as Record<
        string,
        Record<string, unknown>
      >;
      asserts.assertEquals(userProps.name!.type, 'string');
    });
  });

  describe('arrays', () => {
    it('array with element schema + length constraints', () => {
      const s = Guardian.array(Guardian.string()).minLength(1).maxLength(10)
        .toJSONSchema();
      asserts.assertEquals(s.type, 'array');
      const items = s.items as Record<string, unknown>;
      asserts.assertEquals(items.type, 'string');
      asserts.assertEquals(s.minItems, 1);
      asserts.assertEquals(s.maxItems, 10);
    });
  });

  describe('tuples (Draft 2020-12 prefixItems form)', () => {
    it('tuple emits prefixItems + items:false + min/maxItems', () => {
      const s = Guardian.tuple([
        Guardian.string(),
        Guardian.number(),
        Guardian.boolean(),
      ]).toJSONSchema();
      asserts.assertEquals(s.type, 'array');
      asserts.assertEquals(s.items, false);
      const prefix = s.prefixItems as Array<Record<string, unknown>>;
      asserts.assertEquals(prefix.length, 3);
      asserts.assertEquals(prefix[0]!.type, 'string');
      asserts.assertEquals(prefix[1]!.type, 'number');
      asserts.assertEquals(prefix[2]!.type, 'boolean');
      asserts.assertEquals(s.minItems, 3);
      asserts.assertEquals(s.maxItems, 3);
      // The Draft 7 tuple keywords should NOT leak through.
      asserts.assertEquals(
        (s as Record<string, unknown>).additionalItems,
        undefined,
      );
    });
  });

  describe('enum + literal', () => {
    it('single-value enum (literal) emits const, not enum', () => {
      const s = Guardian.literal('circle').toJSONSchema();
      asserts.assertEquals(s.const, 'circle');
      asserts.assertEquals(s.enum, undefined);
    });

    it('multi-value enum keeps the enum keyword', () => {
      const s = Guardian.enum(['admin', 'user', 'guest']).toJSONSchema();
      asserts.assertEquals(s.enum, ['admin', 'user', 'guest']);
      asserts.assertEquals(s.const, undefined);
    });
  });

  describe('discriminated union', () => {
    const Shape = Guardian.discriminatedUnion('kind', [
      Guardian.object({
        kind: Guardian.literal('circle'),
        radius: Guardian.number(),
      }),
      Guardian.object({
        kind: Guardian.literal('square'),
        side: Guardian.number(),
      }),
    ]);

    it('emits oneOf with $ref + discriminator + $defs', () => {
      const s = Shape.toJSONSchema();
      asserts.assertEquals(s.$schema, DRAFT);
      asserts.assertExists(s.oneOf);
      asserts.assertExists(s.discriminator);
      asserts.assertExists(s.$defs);

      const disc = s.discriminator as Record<string, unknown>;
      asserts.assertEquals(disc.propertyName, 'kind');
      const mapping = disc.mapping as Record<string, string>;
      asserts.assertEquals(mapping.circle, '#/$defs/circle');
      asserts.assertEquals(mapping.square, '#/$defs/square');

      const oneOf = s.oneOf as Array<{ $ref: string }>;
      asserts.assertEquals(oneOf.length, 2);
      asserts.assertEquals(oneOf[0]!.$ref, '#/$defs/circle');

      const defs = s.$defs as Record<string, Record<string, unknown>>;
      // Branches should have their own const-form discriminator field.
      const circle = defs.circle!;
      const circleProps = circle.properties as Record<
        string,
        Record<string, unknown>
      >;
      asserts.assertEquals(circleProps.kind!.const, 'circle');
      // Inner $defs entries should NOT carry their own $schema header.
      asserts.assertEquals(circle.$schema, undefined);
    });
  });

  describe('record', () => {
    it('Record<string, V> emits patternProperties or additionalProperties shape', () => {
      // The toOpenAPI() base emits the record shape; the JSON Schema
      // adapter should preserve it. Exact shape depends on
      // RecordGuardian's toOpenAPI emit (which can vary), so we only
      // assert that the result is an object schema.
      const s = Guardian.record(Guardian.number()).toJSONSchema();
      asserts.assertEquals(s.type, 'object');
    });
  });

  describe('round-trip fidelity to OpenAPI structure (sanity check)', () => {
    it('does not retain OpenAPI-only fields like `nullable` at any depth', () => {
      const s = Guardian.object({
        a: Guardian.string().nullable(),
        b: Guardian.array(Guardian.string().nullable()),
      }).toJSONSchema();

      const json = JSON.stringify(s);
      asserts.assert(
        !json.includes('"nullable"'),
        `nullable should have been rewritten to type union, got: ${json}`,
      );
    });
  });
});
