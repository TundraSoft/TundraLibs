/**
 * @module
 *
 * Whole-registry assertion — cross-entity rules over a composed (or
 * hand-built) `{ key: definition }` map: unique database names, FK
 * entity-key resolution, QUERY-terminal reads, encrypted join
 * columns. `Schema()` and `use()` delegate here (with the deferral
 * semantics they need), and `compileRuntime()` runs the full pass so
 * hand-built registries get identical validation.
 *
 * @since 1.0.0
 */

import type { ColumnSpec } from '../definition/Column.ts';
import type { AnyDefinition } from '../definition/schema.ts';
import { qualifiedName } from '../definition/registry-view.ts';
import { NormDefinitionError, type NormErrorCode } from '../errors/mod.ts';
import { definitionIssues } from './definition.ts';

/** Throw one cross-entity registry failure as a coded
 * {@linkcode NormDefinitionError} (single-issue). */
function fail(
  code: NormErrorCode,
  model: string,
  path: string,
  message: string,
): never {
  throw new NormDefinitionError({ code, issues: [{ model, path, message }] });
}

/** Options for {@linkcode assertRegistry} — how strictly to validate a
 * set of entity definitions and their cross-references. */
export type RegistryAssertOptions = {
  /** Message prefix (`Schema('Blog')` / `use()`). */
  scope?: string;
  /** Defer FK entity keys that match nothing (they may live in a
   * schema composed later). `use()`/compile use `false`. */
  allowUnresolved?: boolean;
  /** Also run {@linkcode definitionIssues} per entity (compile path
   * for hand-built registries; `Entity()` already validated
   * builder-made definitions). */
  definitions?: boolean;
  /** Also validate reverse-relation names for collisions. Requires the
   * full graph (FK targets resolved), so `use()` sets it and `Schema()`
   * does not; the compile path validates reverses via `buildReverseMap`. */
  reverseNames?: boolean;
};

/**
 * Validate a registry. Cross-entity failures throw a single-issue
 * coded {@linkcode NormDefinitionError} (with the historical
 * `use()`/`Schema()` messages); per-definition failures (when
 * `definitions: true`) throw an aggregated {@linkcode NormDefinitionError}.
 */
export function assertRegistry(
  entities: Record<string, AnyDefinition>,
  options: RegistryAssertOptions = {},
): void {
  const scope = options.scope ?? 'use()';
  const allowUnresolved = options.allowUnresolved === true;

  if (options.definitions === true) {
    const issues = Object.values(entities).flatMap((def) =>
      definitionIssues(def)
    );
    if (issues.length > 0) throw new NormDefinitionError({ issues });
  }

  const byQualified = new Map<string, AnyDefinition>();
  const byBareName = new Map<string, AnyDefinition[]>();
  const keyByQualified = new Map<string, string>();

  for (const [key, def] of Object.entries(entities)) {
    // Unique database object names (QUERYs are client-side but share
    // the naming space for sanity).
    const qualified = qualifiedName(def);
    const prior = keyByQualified.get(qualified);
    if (prior !== undefined) {
      fail(
        'DUPLICATE_ENTITY',
        key,
        'name',
        `${scope}: '${key}' and '${prior}' both map to database object ` +
          `'${qualified}' — names must be unique.`,
      );
    }
    keyByQualified.set(qualified, key);
    byQualified.set(qualified, def);
    const bare = byBareName.get(def.name);
    if (bare === undefined) byBareName.set(def.name, [def]);
    else bare.push(def);
  }

  const resolve = (ref: string): AnyDefinition | 'missing' | 'ambiguous' => {
    if (ref.includes('.')) return byQualified.get(ref) ?? 'missing';
    const hits = byBareName.get(ref) ?? [];
    if (hits.length === 0) return 'missing';
    if (hits.length > 1) return 'ambiguous';
    return hits[0]!;
  };

  for (const [key, def] of Object.entries(entities)) {
    // FK targets: ENTITY KEYS, resolved against the registry itself —
    // renaming a table/dbSchema is an ALTER, never an FK edit. Must
    // land on a TABLE/VIEW (QUERY is terminal).
    if (def.type !== 'QUERY' && def.foreignKeys) {
      for (
        const [alias, fk] of Object.entries(
          def.foreignKeys as Record<
            string,
            { model: string; on: Record<string, string> }
          >,
        )
      ) {
        const target = entities[fk.model];
        if (target === undefined) {
          if (allowUnresolved) continue; // may resolve at use() time
          fail(
            'UNRESOLVED_FK',
            key,
            `fk.${alias}`,
            `${scope}: ${key}.fk.${alias} references entity key ` +
              `'${fk.model}', which is not registered — compose the ` +
              `schema that provides it.`,
          );
        }
        if (target.type === 'QUERY') {
          fail(
            'TERMINAL_JOIN',
            key,
            `fk.${alias}`,
            `${scope}: ${key}.fk.${alias}: QUERY entities are terminal — ` +
              `they cannot be joined. Reference a TABLE or VIEW.`,
          );
        }
        for (const [local, remote] of Object.entries(fk.on)) {
          if (!(remote in target.columns)) {
            fail(
              'INVALID_FK',
              key,
              `fk.${alias}.on.${local}`,
              `${scope}: ${key}.fk.${alias}: target column '${remote}' ` +
                `(mapped from '${local}') does not exist on '${fk.model}'.`,
            );
          }
          // LEFT JOINs would compare ciphertexts that never match.
          const localSpec = (def.columns as Record<string, ColumnSpec>)[local];
          const remoteSpec =
            (target.columns as Record<string, ColumnSpec>)[remote];
          if (localSpec?.encrypt === true || remoteSpec?.encrypt === true) {
            fail(
              'INVALID_FK',
              key,
              `fk.${alias}`,
              `${scope}: ${key}.fk.${alias}: foreign keys cannot join ` +
                `over encrypted columns — IV-randomized ciphertexts ` +
                `never compare equal.`,
            );
          }
        }
      }
    }

    // Stored SELECTs must not build on a QUERY (terminal kind) —
    // resolution is qualified-aware (a `schema`-qualified read can
    // never hit a QUERY, since QUERYs carry no dbSchema), and a QUERY
    // reading from ITSELF is rejected like any other terminal read.
    if (def.type === 'VIEW' || def.type === 'QUERY') {
      const q = def.query as {
        schema?: string;
        table: string;
        joins?: Record<string, { schema?: string; table: string }>;
      };
      const readsQuery = (dbSchema: string | undefined, table: string) => {
        const ref = dbSchema !== undefined ? `${dbSchema}.${table}` : table;
        const hit = resolve(ref);
        if (hit === 'missing') return false; // raw table / other schema
        if (hit === 'ambiguous') {
          // Multiple entities share the bare name; flag only when a
          // QUERY is actually among them.
          return (byBareName.get(table) ?? []).some((d) => d.type === 'QUERY');
        }
        return hit.type === 'QUERY';
      };
      if (readsQuery(q.schema, q.table)) {
        fail(
          'TERMINAL_JOIN',
          key,
          'query',
          `${scope}: ${key}: its stored SELECT reads from '${q.table}', ` +
            `which is a QUERY — QUERY entities are terminal. Read from ` +
            `a TABLE or VIEW instead.`,
        );
      }
      for (const [jAlias, join] of Object.entries(q.joins ?? {})) {
        if (readsQuery(join.schema, join.table)) {
          fail(
            'TERMINAL_JOIN',
            key,
            `query.joins.${jAlias}`,
            `${scope}: ${key}: join '${jAlias}' targets '${join.table}', ` +
              `which is a QUERY — QUERY entities cannot be joined.`,
          );
        }
      }
    }
  }

  if (options.reverseNames === true) assertReverseNames(entities, scope);
}

/**
 * Validate reverse-relation names, the naming rule `compile`'s
 * `buildReverseMap` enforces at instance level — surfaced here so the
 * standalone `use()` composition (the schema-only test/CI surface) catches
 * the same collisions. A reverse name (explicit `reverseAs`, or the derived
 * default — the bare source-entity key for a single unnamed FK,
 * `<source>_via_<alias>` for several) must not collide with a column, a
 * foreign-key alias, or another reverse on the target. Fail-fast on the
 * first collision; runs only with the full graph (all FK targets resolved).
 */
function assertReverseNames(
  entities: Record<string, AnyDefinition>,
  scope: string,
): void {
  type Candidate = {
    sourceKey: string;
    fkAlias: string;
    explicitName: string | undefined;
  };
  const incoming = new Map<string, Candidate[]>(); // targetKey → candidates
  for (const [sourceKey, source] of Object.entries(entities)) {
    if (source.type === 'QUERY' || source.foreignKeys === undefined) continue;
    for (
      const [fkAlias, fk] of Object.entries(
        source.foreignKeys as Record<
          string,
          { model: string; reverseAs?: string }
        >,
      )
    ) {
      if (entities[fk.model] === undefined) continue; // target resolved elsewhere
      const list = incoming.get(fk.model) ?? [];
      list.push({ sourceKey, fkAlias, explicitName: fk.reverseAs });
      incoming.set(fk.model, list);
    }
  }

  for (const [targetKey, candidates] of incoming) {
    const target = entities[targetKey]!;
    const columns = new Set(Object.keys(target.columns));
    const fkAliases = new Set(
      target.type !== 'QUERY' && target.foreignKeys !== undefined
        ? Object.keys(target.foreignKeys)
        : [],
    );
    const taken = new Set<string>();
    const claim = (name: string, c: Candidate): void => {
      const path = `fk.${c.fkAlias}.reverseAs`;
      if (columns.has(name)) {
        fail(
          'REVERSE_COLLISION',
          c.sourceKey,
          path,
          `${scope}: reverse name '${name}' collides with column ` +
            `'${targetKey}.${name}'`,
        );
      }
      if (fkAliases.has(name)) {
        fail(
          'REVERSE_COLLISION',
          c.sourceKey,
          path,
          `${scope}: reverse name '${name}' collides with foreign-key ` +
            `alias '${name}' on '${targetKey}' — FK aliases resolve first, so ` +
            `the reverse would be unreachable. Set reverseAs.`,
        );
      }
      if (taken.has(name)) {
        fail(
          'REVERSE_COLLISION',
          c.sourceKey,
          path,
          `${scope}: reverse name '${name}' on '${targetKey}' is already taken`,
        );
      }
      taken.add(name);
    };

    // Explicit names first, then the derived defaults grouped by source.
    const auto: Candidate[] = [];
    for (const c of candidates) {
      if (c.explicitName !== undefined) claim(c.explicitName, c);
      else auto.push(c);
    }
    const bySource = new Map<string, Candidate[]>();
    for (const c of auto) {
      const list = bySource.get(c.sourceKey) ?? [];
      list.push(c);
      bySource.set(c.sourceKey, list);
    }
    for (const [sourceKey, cs] of bySource) {
      if (cs.length === 1) claim(sourceKey, cs[0]!);
      else for (const c of cs) claim(`${sourceKey}_via_${c.fkAlias}`, c);
    }
  }
}
