/**
 * @fileoverview Tests for the JSON Schema → guardian/TypeScript source
 * emitter: each emitted guard is evaluated and must accept and reject
 * what the schema it came from does.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Guardian } from '@tundralibs/guardian';
import { isUnknownSource, schemaSource } from './schemaSource.ts';

type Parser = { parse(value: unknown): unknown };

// The emitted source is TypeScript; ` as const` is its only non-JS syntax.
const evaluate = (guard: string): Parser =>
  new Function('Guardian', `return ${guard.replaceAll(' as const', '')};`)(
    Guardian,
  ) as Parser;

const accepts = (guard: Parser, value: unknown): boolean => {
  try {
    guard.parse(value);
    return true;
  } catch {
    return false;
  }
};

const UUID = '6f1c2f6e-8a57-4a39-9d1b-3f6a0c9a2b11';

/** [name, source schema, emitted type, a valid value, an invalid value] */
const CASES: [string, { toJSONSchema(): unknown }, string, unknown, unknown][] =
  [
    [
      'string bounds',
      Guardian.string().minLength(2).maxLength(4),
      'string',
      'abc',
      'a',
    ],
    ['pattern', Guardian.string().pattern(/^[a-z]+$/), 'string', 'abc', 'A1'],
    ['email', Guardian.string().email(), 'string', 'a@b.co', 'nope'],
    ['uuid', Guardian.string().uuid(), 'string', UUID, 'nope'],
    [
      'integer bounds',
      Guardian.number().integer().min(1).max(5),
      'number',
      3,
      9,
    ],
    ['integer', Guardian.number().integer(), 'number', 3, 3.5],
    ['boolean', Guardian.boolean(), 'boolean', true, 'maybe'],
    ['nullable', Guardian.number().nullable(), 'number | null', null, 'x'],
    [
      'enum',
      Guardian.enum(['admin', 'user'] as const),
      '"admin" | "user"',
      'user',
      'root',
    ],
    ['literal', Guardian.literal('v1'), '"v1"', 'v1', 'v2'],
    [
      'array bounds',
      Guardian.array(Guardian.number()).maxLength(2),
      'number[]',
      [1, 2],
      [1, 2, 3],
    ],
    [
      'array of a union',
      Guardian.array(Guardian.enum(['a', 'b'] as const)),
      '("a" | "b")[]',
      ['a'],
      ['c'],
    ],
    [
      'tuple',
      Guardian.tuple([Guardian.string(), Guardian.number()]),
      '[string, number]',
      ['a', 1],
      [1, 'a'],
    ],
    [
      'record',
      Guardian.record(Guardian.string(), Guardian.number()),
      'Record<string, number>',
      { a: 1 },
      { a: 'x' },
    ],
    [
      'object with an optional key',
      Guardian.object({
        id: Guardian.string(),
        'full-name': Guardian.string().optional(),
      }),
      '{ id: string; "full-name"?: string }',
      { id: 'a' },
      { 'full-name': 'b' },
    ],
    [
      'discriminated union',
      Guardian.discriminatedUnion('t', [
        Guardian.object({ t: Guardian.literal('a') }),
        Guardian.object({ t: Guardian.literal('b'), n: Guardian.number() }),
      ]),
      '{ t: "a" } | { t: "b"; n: number }',
      { t: 'b', n: 1 },
      { t: 'b' },
    ],
  ];

describe('rapid.cli sdk schemaSource', () => {
  for (const [name, schema, type, valid, invalid] of CASES) {
    it(`${name}: the emitted guard accepts and rejects like its schema`, () => {
      const source = schemaSource(schema.toJSONSchema());
      asserts.assertEquals(source.type, type);
      const guard = evaluate(source.guard);
      asserts.assert(accepts(guard, valid), `${source.guard} rejected valid`);
      asserts.assert(
        !accepts(guard, invalid),
        `${source.guard} accepted invalid`,
      );
    });
  }

  it('a passthrough object keeps undeclared keys and types them as unknown', () => {
    const source = schemaSource(
      Guardian.object({ k: Guardian.boolean() }).passthrough().toJSONSchema(),
    );
    asserts.assertEquals(source.type, '{ k: boolean; [key: string]: unknown }');
    asserts.assertEquals(evaluate(source.guard).parse({ k: true, x: 1 }), {
      k: true,
      x: 1,
    });
  });

  it('reads OpenAPI 3.0 `nullable: true` as well as a null type entry', () => {
    asserts.assertEquals(
      schemaSource({ type: 'string', nullable: true }),
      { guard: 'Guardian.string().nullable()', type: 'string | null' },
    );
  });

  it('falls back to unknown for what it cannot express, never to a wrong guard', () => {
    for (
      const schema of [
        undefined,
        {},
        { type: 'object' }, // rapid's placeholder for "no schema declared"
        { $ref: '#/components/schemas/Elsewhere' },
        { oneOf: [{ type: 'string' }, { type: 'number' }] },
      ]
    ) {
      asserts.assert(
        isUnknownSource(schemaSource(schema)),
        JSON.stringify(schema),
      );
    }
  });
});
