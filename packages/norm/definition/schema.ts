/**
 * @module
 *
 * Named schemas + composition. In norm, a **schema** is a NAMED
 * collection of entities (`Schema('Blog', {...})`) — the database
 * namespace is the separate `dbSchema` option on `Entity()`.
 *
 * ```ts
 * // models/blog/mod.ts — the folder IS the schema
 * export const Blog = Schema('Blog', { Users, Posts, Comments });
 *
 * // models/stats/mod.ts — standalone; knows nothing about the blog
 * export const Stats = Schema('Stats', { VisitorStats });
 *
 * // app — compose exactly the schemas each instance exposes
 * const registry = use(Blog, Stats);        // one import line per schema
 * const scoped   = use(Stats);              // stats-only instance
 * ```
 *
 * `Schema()` accepts a plain object OR a namespace import — non-entity
 * exports (helpers, constants) are filtered out, so barrels work
 * directly.
 *
 * FK targets are ENTITY KEYS — the registry names entities are
 * exposed under (unique by construction within a composition). Keys
 * may live in ANOTHER schema: `Schema()` validates what it can see
 * and defers unknown keys; `use()` — where the full merged registry
 * exists — resolves everything and fails with named errors for
 * missing keys or terminal-kind violations:
 *
 * - FK targets must resolve to a registered TABLE/VIEW — never QUERY.
 * - Stored SELECTs (of views AND queries) must not read from or join
 *   a registered QUERY's database name. Views remain freely
 *   composable.
 *
 * @since 1.0.0
 */

import type {
  QueryDefinition,
  TableDefinition,
  ViewDefinition,
} from './entity.ts';
import { assertRegistry } from '../asserts/registry.ts';
import { NormDefinitionError } from '../errors/mod.ts';

/** Any registrable definition. */
export type AnyDefinition =
  // deno-lint-ignore no-explicit-any
  | TableDefinition<any, any, any>
  // deno-lint-ignore no-explicit-any
  | ViewDefinition<any, any>
  // deno-lint-ignore no-explicit-any
  | QueryDefinition<any, any>;

/** Flatten intersections into one readable object type (hover-friendly). */
type _Prettify<T> = { [K in keyof T]: T[K] };

/** The registry shape, with non-entity values filtered out of the type. */
export type SchemaDefinition<M> = {
  [K in keyof M as M[K] extends AnyDefinition ? K : never]: M[K];
};

/**
 * A named, immutable collection of entities — what `use()` composes
 * into the registry a Norm instance is constructed over.
 *
 * `E` is intentionally unconstrained (defaulted): a key-filtered
 * mapped type can't be PROVEN to satisfy `Record<string,
 * AnyDefinition>` while its source is still generic, but every
 * concrete schema trivially does — and `use()` re-imposes the
 * constraint at its (always concrete) call sites.
 */
export type SchemaValue<
  N extends string = string,
  E = Record<string, AnyDefinition>,
> = {
  readonly name: N;
  readonly entities: E;
};

/** Entities exposed by a schema value. */
type _EntitiesOf<S> = S extends { readonly entities: infer E } ? E : never;

type _UnionToIntersection<U> =
  (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I
    : never;

/** The merged registry type of `use(...schemas)` — flat, hover-friendly. */
export type ComposedSchema<S extends readonly SchemaValue[]> = _Prettify<
  _UnionToIntersection<_EntitiesOf<S[number]>>
>;

function isDefinition(v: unknown): v is AnyDefinition {
  return typeof v === 'object' && v !== null &&
    'columns' in v && 'name' in v && 'type' in v &&
    ((v as { type: unknown }).type === 'TABLE' ||
      (v as { type: unknown }).type === 'VIEW' ||
      (v as { type: unknown }).type === 'QUERY');
}

/**
 * Shared whole-graph validation — the implementation lives in
 * ../asserts/registry.ts (single source; also run by compile for
 * hand-built registries).
 */
function validateRegistry(
  scope: string,
  entities: Record<string, AnyDefinition>,
  allowUnresolved: boolean,
): void {
  // Reverse-name collisions need the full graph (all FK targets resolved),
  // so validate them in the composed `use()` pass, not the partial
  // `Schema()` pass. [F6]
  assertRegistry(entities, {
    scope,
    allowUnresolved,
    reverseNames: !allowUnresolved,
  });
}

/**
 * Define a named schema — a collection of entities an application
 * exposes. Non-entity values in the input (helper exports from a
 * barrel / namespace import) are ignored.
 */
export function Schema<
  N extends string,
  const M extends Record<string, unknown>,
>(name: N, models: M): SchemaValue<N, _Prettify<SchemaDefinition<M>>> {
  if (name.trim() === '') {
    throw new Error('Schema(): name must be a non-empty string');
  }
  const entities: Record<string, AnyDefinition> = {};
  for (const [key, value] of Object.entries(models)) {
    if (isDefinition(value)) entities[key] = value;
  }

  validateRegistry(`Schema('${name}')`, entities, true);

  return { name, entities } as SchemaValue<N, _Prettify<SchemaDefinition<M>>>;
}

/**
 * Compose schemas into the flat registry a Norm instance exposes.
 * Registry keys must be unique across the composed schemas; all
 * deferred FK names must resolve here.
 */
export function use<const S extends readonly SchemaValue[]>(
  ...schemas: S
): ComposedSchema<S> {
  const merged: Record<string, AnyDefinition> = {};
  const originOf = new Map<string, string>();
  for (const s of schemas) {
    for (const [key, def] of Object.entries(s.entities)) {
      const prior = originOf.get(key);
      if (prior !== undefined) {
        throw new NormDefinitionError({
          code: 'DUPLICATE_ENTITY',
          issues: [{
            model: key,
            path: 'name',
            message: `use(): entity '${key}' is provided by both '${prior}' ` +
              `and '${s.name}' — registry keys must be unique across ` +
              `composed schemas.`,
          }],
        });
      }
      originOf.set(key, s.name);
      merged[key] = def;
    }
  }

  validateRegistry('use()', merged, false);

  return merged as ComposedSchema<S>;
}
