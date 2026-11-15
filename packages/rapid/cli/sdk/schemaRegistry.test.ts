/**
 * @fileoverview Tests for the schema registry: what is declared once,
 * what is derived from what, and what is written out because the match
 * is not exact.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { schemaRegistry } from './schemaRegistry.ts';

const string = { type: 'string' };
const object = (
  properties: Record<string, unknown>,
  required: string[],
  title?: string,
) => ({
  type: 'object',
  ...(title === undefined ? {} : { title }),
  properties,
  required,
  additionalProperties: false,
});
const user = object(
  { id: string, name: string, role: string },
  ['id', 'name', 'role'],
  'User',
);

/** The declaration of `name`'s schema constant, right-hand side only. */
const guard = (source: string, name: string): string =>
  source.match(new RegExp(`${name}Schema: \\w+<${name}> = (.*);`))?.[1] ?? '';

describe('rapid.cli sdk schemaRegistry', () => {
  it('declares a schema several routes use once, and aliases it for the rest', () => {
    const registry = schemaRegistry(() => false);
    const body = object({ name: string }, ['name']);
    registry.use('ACreateBody', 'a', body);
    registry.use('BCreateBody', 'b', { ...body });
    const { source, renamed } = registry.finish();
    asserts.assertStringIncludes(
      guard(source, 'ACreateBody'),
      'Guardian.object',
    );
    asserts.assertEquals(guard(source, 'BCreateBody'), 'ACreateBodySchema');
    asserts.assertStringIncludes(
      source,
      'export type BCreateBody = ACreateBody;',
    );
    asserts.assertEquals(renamed.size, 0);
  });

  it('declares a titled schema under its title and writes what is made from it as guardian operations on it', () => {
    const registry = schemaRegistry(() => false);
    // `omit`, `partial` and `extend` keep the title: the most used wins it.
    registry.use('ListResponse', 'l', { type: 'array', items: user });
    registry.use('FindResponse', 'f', user);
    registry.use(
      'CreateBody',
      'c',
      object({ name: string, role: string }, ['name', 'role'], 'User'),
    );
    registry.use(
      'PatchBody',
      'p',
      object({ id: string, name: string, role: string }, [], 'User'),
    );
    registry.use('IdOnly', 'i', object({ id: string }, ['id']));
    registry.use(
      'DetailResponse',
      'd',
      object(
        { id: string, name: string, role: string, bio: string },
        ['id', 'name', 'role'],
        'User',
      ),
    );
    registry.use('MaybeResponse', 'm', { ...user, nullable: true });
    const { source, renamed } = registry.finish();

    asserts.assertEquals([...renamed], [['FindResponse', 'User']]);
    asserts.assertStringIncludes(guard(source, 'User'), 'Guardian.object');
    asserts.assertEquals(
      guard(source, 'ListResponse'),
      'Guardian.array(UserSchema)',
    );
    asserts.assertEquals(guard(source, 'CreateBody'), 'UserSchema.omit("id")');
    asserts.assertEquals(guard(source, 'PatchBody'), 'UserSchema.partial()');
    asserts.assertEquals(guard(source, 'IdOnly'), 'UserSchema.pick("id")');
    asserts.assertEquals(
      guard(source, 'DetailResponse'),
      'UserSchema.extend({ bio: Guardian.string().optional() })',
    );
    asserts.assertEquals(
      guard(source, 'MaybeResponse'),
      'UserSchema.nullable()',
    );
    asserts.assertStringIncludes(
      source,
      'export type DetailResponse = User & { bio?: string };',
    );
    // What a declaration refers to is declared above it.
    asserts.assert(
      source.indexOf('const UserSchema') <
        source.indexOf('const ListResponseSchema'),
    );
  });

  it('writes a schema out in full when it only resembles another', () => {
    const registry = schemaRegistry(() => false);
    registry.use('FindResponse', 'f', user);
    // Same keys, but `name` is constrained differently.
    registry.use(
      'RenameBody',
      'r',
      object({ name: { type: 'string', minLength: 2 } }, ['name']),
    );
    // Optional here, required there: neither a pick nor a partial.
    registry.use(
      'LooseBody',
      'l',
      object({ id: string, name: string, role: string }, ['id']),
    );
    // A passthrough object is not one guardian's object methods apply to.
    registry.use('OpenBody', 'o', { ...user, additionalProperties: true });
    const { source } = registry.finish();
    for (const name of ['RenameBody', 'LooseBody', 'OpenBody']) {
      asserts.assertStringIncludes(guard(source, name), 'Guardian.object({');
    }
  });

  it('keeps the route name when the title is one the generated files already use', () => {
    const registry = schemaRegistry((title) => title === 'User');
    registry.use('FindResponse', 'f', user);
    const { source, renamed } = registry.finish();
    asserts.assertEquals(renamed.size, 0);
    asserts.assertStringIncludes(source, 'export type FindResponse =');
  });
});
