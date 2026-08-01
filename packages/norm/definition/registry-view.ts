/**
 * @module
 *
 * Tiny shared views over a registry input — the ONE `entitiesOf`
 * (SchemaValue-or-plain-map unwrap) and `qualifiedName` (`dbSchema.name`
 * qualifier) that `docs.ts`, `snapshot.ts`, and `asserts/registry.ts`
 * all consume instead of re-declaring. Type-only dependency on
 * `schema.ts`, so it stays a leaf (no value import cycles).
 *
 * @since 1.0.0
 */

import type { AnyDefinition, SchemaValue } from './schema.ts';

/** What the doc / snapshot emitters accept: a schema value
 * (`Schema('Blog', {...})`) or a plain `{ key: definition }` map. */
export type RegistryInput = SchemaValue | Record<string, AnyDefinition>;

/** Unwrap a schema value or plain registry map to its entity map. */
export function entitiesOf(
  input: RegistryInput,
): Record<string, AnyDefinition> {
  if (
    typeof input === 'object' && input !== null && 'entities' in input &&
    'name' in input && typeof (input as SchemaValue).name === 'string' &&
    typeof (input as SchemaValue).entities === 'object'
  ) {
    return (input as SchemaValue).entities as Record<string, AnyDefinition>;
  }
  return input as Record<string, AnyDefinition>;
}

/** Qualified database object name (`dbSchema.name` when namespaced,
 * bare `name` otherwise). */
export function qualifiedName(def: AnyDefinition): string {
  const dbSchema = (def as { dbSchema?: string }).dbSchema;
  return dbSchema === undefined ? def.name : `${dbSchema}.${def.name}`;
}
