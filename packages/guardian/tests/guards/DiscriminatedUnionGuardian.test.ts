import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import {
  DiscriminatedUnionGuardian,
  Guardian,
  GuardianError,
} from '../../mod.ts';

describe('guardian.DiscriminatedUnionGuardian', () => {
  describe('basic dispatch', () => {
    it('routes to the correct branch by discriminator value', () => {
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

      const c = Shape.parse({ kind: 'circle', radius: 5 });
      asserts.assertEquals(c, { kind: 'circle', radius: 5 });

      const s = Shape.parse({ kind: 'square', side: 3 });
      asserts.assertEquals(s, { kind: 'square', side: 3 });
    });

    it('narrows the output type by discriminator (compile-time)', () => {
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
      const out = Shape.parse({ kind: 'circle', radius: 5 });
      if (out.kind === 'circle') {
        // `out.radius` must be `number` here — won't compile otherwise.
        const r: number = out.radius;
        asserts.assertEquals(r, 5);
      }
    });

    it('passes through Guardian.enum() with a single allowed value', () => {
      // Discriminator can also be enum([value]) — literal is just sugar.
      const Shape = Guardian.discriminatedUnion('kind', [
        Guardian.object({
          kind: Guardian.enum(['a'] as const),
          x: Guardian.number(),
        }),
      ]);
      asserts.assertEquals(Shape.parse({ kind: 'a', x: 1 }), {
        kind: 'a',
        x: 1,
      });
    });
  });

  describe('multi-value discriminator (aliases)', () => {
    it('routes multiple discriminator values to the same branch', () => {
      const Rect = Guardian.object({
        kind: Guardian.enum(['square', 'rect'] as const),
        side: Guardian.number(),
      });
      const Circle = Guardian.object({
        kind: Guardian.literal('circle'),
        radius: Guardian.number(),
      });
      const Shape = Guardian.discriminatedUnion('kind', [Rect, Circle]);

      asserts.assertEquals(
        Shape.parse({ kind: 'square', side: 1 }).kind,
        'square',
      );
      asserts.assertEquals(Shape.parse({ kind: 'rect', side: 1 }).kind, 'rect');
      asserts.assertEquals(
        Shape.parse({ kind: 'circle', radius: 2 }).kind,
        'circle',
      );
    });

    it('exposes the full allowed value set via allowedValues', () => {
      const Rect = Guardian.object({
        kind: Guardian.enum(['square', 'rect'] as const),
        side: Guardian.number(),
      });
      const Shape = Guardian.discriminatedUnion('kind', [Rect]);
      asserts.assertEquals(
        new Set(Shape.allowedValues),
        new Set(['square', 'rect']),
      );
    });
  });

  describe('construction-time errors', () => {
    it('rejects empty member list', () => {
      asserts.assertThrows(
        () => Guardian.discriminatedUnion('kind', []),
        Error,
        'at least one branch',
      );
    });

    it('rejects empty discriminator key', () => {
      asserts.assertThrows(
        () =>
          Guardian.discriminatedUnion('', [
            Guardian.object({ kind: Guardian.literal('a') }),
          ]),
        Error,
        'non-empty discriminator',
      );
    });

    it('rejects a branch missing the discriminator field', () => {
      asserts.assertThrows(
        () =>
          Guardian.discriminatedUnion('kind', [
            // No `kind` field at all.
            Guardian.object({ x: Guardian.number() }),
          ]),
        TypeError,
        "branch's 'kind' field must be",
      );
    });

    it('rejects a branch where the discriminator field is not an enum', () => {
      asserts.assertThrows(
        () =>
          Guardian.discriminatedUnion('kind', [
            Guardian.object({
              kind: Guardian.string(), // not an enum
              x: Guardian.number(),
            }),
          ]),
        TypeError,
        "branch's 'kind' field must be",
      );
    });

    it('rejects duplicate discriminator values across branches', () => {
      asserts.assertThrows(
        () =>
          Guardian.discriminatedUnion('kind', [
            Guardian.object({
              kind: Guardian.literal('a'),
              x: Guardian.number(),
            }),
            Guardian.object({
              kind: Guardian.literal('a'),
              y: Guardian.number(),
            }),
          ]),
        Error,
        "duplicate discriminator value 'a'",
      );
    });
  });

  describe('parse-time errors', () => {
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

    it('throws on non-object inputs', () => {
      asserts.assertThrows(() => Shape.parse('circle'), GuardianError);
      asserts.assertThrows(() => Shape.parse(null), GuardianError);
      asserts.assertThrows(() => Shape.parse([]), GuardianError);
      asserts.assertThrows(() => Shape.parse(42), GuardianError);
    });

    it('reports unknown discriminator value with the allowed set', () => {
      asserts.assertThrows(
        () => Shape.parse({ kind: 'triangle', a: 1 }),
        GuardianError,
        "Unknown kind: 'triangle'",
      );
    });

    it('delegates to the branch for inner field validation', () => {
      asserts.assertThrows(
        () => Shape.parse({ kind: 'circle', radius: 'not-a-number' }),
        GuardianError,
      );
    });

    it('custom errorMessage survives a chain op (describe)', () => {
      const Custom = Guardian.discriminatedUnion(
        'kind',
        [Guardian.object({ kind: Guardian.literal('circle') })],
        'not a known shape',
      );
      // A chain op goes through `_cloneWith`, which used to pass
      // `undefined` for errorMessage. The custom message must still
      // surface after chaining.
      const chained = Custom.describe({ description: 'a tagged shape' });
      asserts.assertThrows(
        () => chained.parse({ kind: 'triangle' }),
        GuardianError,
        'not a known shape',
      );
      asserts.assertThrows(
        () => chained.parse(42),
        GuardianError,
        'not a known shape',
      );
    });

    it('_cloneWith carries the custom errorMessage onto the clone', () => {
      // Regression: `_cloneWith` passed `undefined` and no field held
      // the message, so the clone had no record of the custom message.
      const Custom = Guardian.discriminatedUnion(
        'kind',
        [Guardian.object({ kind: Guardian.literal('circle') })],
        'not a known shape',
      );
      const chained = Custom.describe({ description: 'x' });
      asserts.assertEquals(
        (chained as unknown as { __errorMessage?: string }).__errorMessage,
        'not a known shape',
      );
    });
  });

  describe('introspection', () => {
    const Shape = Guardian.discriminatedUnion('kind', [
      Guardian.object({ kind: Guardian.literal('a'), x: Guardian.number() }),
      Guardian.object({ kind: Guardian.literal('b'), y: Guardian.number() }),
    ]);

    it('exposes the discriminator key', () => {
      asserts.assertEquals(Shape.discriminator, 'kind');
    });

    it('exposes the options list', () => {
      asserts.assertEquals(Shape.options.length, 2);
    });

    it('variant() returns the matching branch', () => {
      const branch = Shape.variant('a');
      asserts.assertExists(branch);
      asserts.assertEquals(branch?.parse({ kind: 'a', x: 1 }), {
        kind: 'a',
        x: 1,
      });
    });

    it('variant() returns undefined for unknown values', () => {
      asserts.assertEquals(Shape.variant('z'), undefined);
    });
  });

  describe('OpenAPI output', () => {
    it('emits proper discriminator schema', () => {
      const Shape = Guardian.discriminatedUnion('kind', [
        Guardian.object({ kind: Guardian.literal('a'), x: Guardian.number() }),
        Guardian.object({ kind: Guardian.literal('b'), y: Guardian.number() }),
      ]);
      const openapi = Shape.toOpenAPI();
      asserts.assertExists(openapi.oneOf);
      asserts.assertExists(openapi.discriminator);
      const disc = openapi.discriminator as Record<string, unknown>;
      asserts.assertEquals(disc.propertyName, 'kind');
      asserts.assertExists(disc.mapping);
    });
  });

  describe('class export', () => {
    it('DiscriminatedUnionGuardian is constructable directly', () => {
      const Shape = new DiscriminatedUnionGuardian('kind', [
        Guardian.object({ kind: Guardian.literal('x'), v: Guardian.number() }),
      ]);
      asserts.assertEquals(Shape.parse({ kind: 'x', v: 1 }), {
        kind: 'x',
        v: 1,
      });
    });
  });
});
