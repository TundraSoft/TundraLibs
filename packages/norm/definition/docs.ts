/**
 * @module
 *
 * Documentation emitters — the Guardian `toMarkdown`/`toOpenAPI`
 * counterpart for entity definitions. Because definitions are PLAIN
 * DATA, docs and diagrams are pure functions over them:
 *
 * ```ts ignore
 * const registry = use(Blog, Stats);
 * console.log(toMermaidERD(registry)); // ER diagram (mermaid)
 * console.log(toMarkdown(Blog));       // per-entity reference doc
 * ```
 *
 * Both accept a composed registry (`use(...)` result), a schema value
 * (`Schema('Blog', {...})`), or any plain `{ key: definition }` map.
 *
 * @since 1.0.0
 */

import { type ColumnSpec, isExpressionValue } from './Column.ts';
import type { AnyDefinition } from './schema.ts';
import {
  entitiesOf,
  qualifiedName as qualified,
  type RegistryInput as DocInput,
} from './registry-view.ts';

/** Mermaid-safe identifier (collapsed separators, no trailing junk). */
function mmId(name: string): string {
  return name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+$/, '');
}

/** Mermaid quoted-string slot: the erDiagram grammar has NO escape
 * sequence inside double quotes — substitute them, collapse every line-break
 * variant (a lone `\r` included, not just `\r\n`). */
function mmText(v: string): string {
  return v.replace(/"/g, "'").replace(/\r\n?|\n/g, ' ');
}

/** Escape a value for a GFM table cell: backslash first (so it can't
 * collide with our own escape), then pipes, then every line-break variant. */
function mdCell(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(
    /\r\n?|\n/g,
    ' ',
  );
}

/** Render a column's SQL-ish type (`VARCHAR(255)`, `DECIMAL(12,2)`). */
function typeOf(spec: ColumnSpec): string {
  if (spec.length !== undefined) return `${spec.type}(${spec.length})`;
  if (spec.precision !== undefined) {
    return `${spec.type}(${spec.precision},${spec.scale})`;
  }
  return spec.type;
}

/** Human rendering of a default slot. */
function defaultOf(v: unknown): string {
  if (v === undefined) return '';
  if (typeof v === 'function') return '(generated)';
  if (isExpressionValue(v)) return `expr:${v.$$_expression}`;
  return JSON.stringify(v);
}

/** Constraint summary for docs: validators + storage flags. */
function constraintsOf(spec: ColumnSpec): string {
  const parts: string[] = [];
  if (spec.encrypt) parts.push(spec.hash ? 'encrypted+hash' : 'encrypted');
  if (spec.hashed) parts.push(`digest(${spec.hashed})`);
  if (spec.masked) parts.push(`mask(${spec.masked.source})`);
  if (spec.project === false) parts.push('hidden');
  if (spec.filterable === false) parts.push('unfilterable');
  if (spec.disableInsert && spec.disableUpdate) parts.push('norm-owned');
  if (spec.lov) parts.push(`lov(${spec.lov.join('|')})`);
  if (spec.pattern) parts.push(`pattern(/${spec.pattern.source}/)`);
  if (spec.min !== undefined) parts.push(`min(${String(spec.min)})`);
  if (spec.max !== undefined) parts.push(`max(${String(spec.max)})`);
  if (spec.minLength !== undefined) parts.push(`minLength(${spec.minLength})`);
  if (spec.maxLength !== undefined) parts.push(`maxLength(${spec.maxLength})`);
  return parts.join(', ');
}

/** Resolve a stored-SELECT table reference (database-name domain). */
function resolveRef(
  entities: Record<string, AnyDefinition>,
  ref: string,
): AnyDefinition | undefined {
  const defs = Object.values(entities);
  if (ref.includes('.')) return defs.find((d) => qualified(d) === ref);
  const hits = defs.filter((d) => d.name === ref);
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * Mermaid `erDiagram` of the registry: entity blocks with typed
 * columns (PK/FK markers, comments), FK relationships labelled by
 * alias, and dashed `derives` edges from views/queries to their base.
 */
export function toMermaidERD(input: DocInput): string {
  const entities = entitiesOf(input);
  const lines: string[] = ['erDiagram'];

  // Assign mermaid ids up front; two distinct qualified names may
  // sanitize identically ('a.b' vs 'a_b') — disambiguate with a
  // deterministic suffix so mermaid never merges their nodes.
  const ids = new Map<AnyDefinition, string>();
  const taken = new Map<string, number>();
  for (const def of Object.values(entities)) {
    const base = mmId(qualified(def));
    const seen = taken.get(base) ?? 0;
    taken.set(base, seen + 1);
    ids.set(def, seen === 0 ? base : `${base}_${seen + 1}`);
  }

  for (const def of Object.values(entities)) {
    const fkLocals = new Set<string>();
    // FK markers: TABLE (physical) and VIEW (LOGICAL join-only) fks —
    // QUERY carries none.
    const localFks = (def as {
      foreignKeys?: Record<string, { on: Record<string, string> }>;
    }).foreignKeys;
    if (localFks !== undefined) {
      for (const fk of Object.values(localFks)) {
        for (const local of Object.keys(fk.on)) fkLocals.add(local);
      }
    }
    lines.push(`  ${ids.get(def)} {`);
    for (
      const [col, spec] of Object.entries(
        def.columns as Record<string, ColumnSpec>,
      )
    ) {
      const keys: string[] = [];
      if (
        def.type === 'TABLE' &&
        (def.primaryKeys as readonly string[]).includes(col)
      ) keys.push('PK');
      if (fkLocals.has(col)) keys.push('FK');
      const commentBits = [
        spec.comment,
        spec.encrypt ? '(encrypted)' : undefined,
      ].filter((b): b is string => Boolean(b));
      const attr = [
        mmId(typeOf(spec)),
        mmId(col),
        keys.join(', '),
        commentBits.length ? `"${mmText(commentBits.join(' '))}"` : '',
      ].filter((p) => p !== '').join(' ');
      lines.push(`    ${attr}`);
    }
    lines.push('  }');
  }

  for (const def of Object.values(entities)) {
    // Relationship edges from physical (TABLE) AND logical (VIEW) fks —
    // a VIEW's join fks are what give the M2M-via-view reverse relation.
    const edgeFks = (def as {
      foreignKeys?: Record<string, { model: string }>;
    }).foreignKeys;
    if (edgeFks !== undefined) {
      for (const [alias, fk] of Object.entries(edgeFks)) {
        // FK targets are entity KEYS — look up in the registry itself.
        const target = entities[fk.model];
        const targetId = target !== undefined
          ? ids.get(target)
          : mmId(fk.model);
        lines.push(
          `  ${ids.get(def)} }o--|| ${targetId} : "${mmText(alias)}"`,
        );
      }
    }
    if (def.type === 'VIEW' || def.type === 'QUERY') {
      const base = (def.query as { table: string }).table;
      const target = resolveRef(entities, base);
      const targetId = target !== undefined ? ids.get(target) : mmId(base);
      lines.push(`  ${ids.get(def)} ||..|| ${targetId} : "derives"`);
    }
  }

  return lines.join('\n');
}

/**
 * PlantUML entity-relationship diagram of the registry — the PlantUML
 * counterpart to {@link toMermaidERD}. Emits a full `@startuml … @enduml`
 * block: one `entity` per definition with typed columns (PK / FK /
 * encrypted markers), crow's-foot FK relationships labelled by alias,
 * and dashed `derives` edges from views/queries to their base table.
 *
 * ```ts ignore
 * await writeTextFile('schema.puml', toPlantUML(use(Blog, Stats)));
 * ```
 */
export function toPlantUML(input: DocInput): string {
  const entities = entitiesOf(input);
  const lines: string[] = [
    '@startuml',
    "' generated by @tundralibs/norm toPlantUML",
    'hide circle',
    'skinparam linetype ortho',
    '',
  ];

  // Deterministic aliases — a qualified name ('a.b') is not a valid bare
  // PlantUML id, and two names may sanitize identically; disambiguate.
  const ids = new Map<AnyDefinition, string>();
  const taken = new Map<string, number>();
  for (const def of Object.values(entities)) {
    const base = `e_${mmId(qualified(def))}`;
    const seen = taken.get(base) ?? 0;
    taken.set(base, seen + 1);
    ids.set(def, seen === 0 ? base : `${base}_${seen + 1}`);
  }

  for (const def of Object.values(entities)) {
    const fkLocals = new Set<string>();
    const localFks = (def as {
      foreignKeys?: Record<string, { on: Record<string, string> }>;
    }).foreignKeys;
    if (localFks !== undefined) {
      for (const fk of Object.values(localFks)) {
        for (const local of Object.keys(fk.on)) fkLocals.add(local);
      }
    }
    lines.push(`entity "${qualified(def)}" as ${ids.get(def)} {`);
    for (
      const [col, spec] of Object.entries(
        def.columns as Record<string, ColumnSpec>,
      )
    ) {
      const isPk = def.type === 'TABLE' &&
        (def.primaryKeys as readonly string[]).includes(col);
      const marks: string[] = [];
      if (isPk) marks.push('<<PK>>');
      if (fkLocals.has(col)) marks.push('<<FK>>');
      if (spec.encrypt) marks.push('<<encrypted>>');
      // `*` = mandatory in PlantUML's entity notation — mark the PK.
      const bullet = isPk ? '* ' : '';
      const tail = marks.length ? ` ${marks.join(' ')}` : '';
      lines.push(`  ${bullet}${col} : ${typeOf(spec)}${tail}`);
    }
    lines.push('}');
    lines.push('');
  }

  for (const def of Object.values(entities)) {
    const edgeFks = (def as {
      foreignKeys?: Record<string, { model: string }>;
    }).foreignKeys;
    if (edgeFks !== undefined) {
      for (const [alias, fk] of Object.entries(edgeFks)) {
        const target = entities[fk.model];
        const targetId = target !== undefined
          ? ids.get(target)
          : `e_${mmId(fk.model)}`;
        lines.push(`${ids.get(def)} }o--|| ${targetId} : ${mmId(alias)}`);
      }
    }
    if (def.type === 'VIEW' || def.type === 'QUERY') {
      const base = (def.query as { table: string }).table;
      const target = resolveRef(entities, base);
      const targetId = target !== undefined
        ? ids.get(target)
        : `e_${mmId(base)}`;
      lines.push(`${ids.get(def)} ||..|| ${targetId} : derives`);
    }
  }

  lines.push('@enduml');
  return lines.join('\n');
}

/**
 * Markdown reference documentation: one section per entity with its
 * kind, comment, column table (type / nullability / defaults /
 * constraints), keys, indexes, and declared hooks.
 */
export function toMarkdown(input: DocInput): string {
  const entities = entitiesOf(input);
  const out: string[] = [];

  for (const [key, def] of Object.entries(entities)) {
    out.push(`## ${key} — \`${qualified(def)}\` (${def.type})`, '');
    const comment = (def as { comment?: string }).comment;
    if (comment) out.push(`> ${mdCell(comment)}`, '');

    out.push(
      '| Column | Type | Nullable | Default (insert / update) | Constraints | Comment |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (
      const [col, spec] of Object.entries(
        def.columns as Record<string, ColumnSpec>,
      )
    ) {
      const ins = defaultOf(spec.default?.insert);
      const upd = defaultOf(spec.default?.update);
      // Positional — an update-only default must not read as an
      // insert default.
      const defaults = ins === '' && upd === ''
        ? ''
        : `${ins || '—'} / ${upd || '—'}`;
      out.push(
        `| ${mdCell(col)} | ${mdCell(typeOf(spec))} | ` +
          `${spec.nullable ? 'yes' : ''} | ${mdCell(defaults)} | ` +
          `${mdCell(constraintsOf(spec))} | ${mdCell(spec.comment ?? '')} |`,
      );
    }
    out.push('');

    if (def.type === 'TABLE') {
      out.push(
        `- **Primary key:** ${(def.primaryKeys as string[]).join(', ')}`,
      );
    } else {
      out.push(`- **Reads from:** ${(def.query as { table: string }).table}`);
    }

    // Foreign keys: physical on a TABLE, LOGICAL (join-only) on a VIEW —
    // the latter drive M2M-via-view reverse relations, so document them.
    const fks = (def as {
      foreignKeys?: Record<
        string,
        { model: string; on: Record<string, string> }
      >;
    }).foreignKeys;
    if (fks !== undefined) {
      for (const [alias, fk] of Object.entries(fks)) {
        const on = Object.entries(fk.on)
          .map(([l, r]) => `${l} → ${r}`).join(', ');
        out.push(`- **FK ${alias}:** → ${fk.model} (${on})`);
      }
    }

    if (def.type === 'TABLE' && def.indexes) {
      for (
        const [idx, cols] of Object.entries(
          def.indexes as Record<string, readonly string[]>,
        )
      ) {
        out.push(`- **Index ${idx}:** ${cols.join(', ')}`);
      }
    }

    const hooks = (def as { hooks?: Record<string, unknown> }).hooks;
    if (hooks !== undefined) {
      out.push(`- **Hooks:** ${Object.keys(hooks).join(', ')}`);
    }
    out.push('');
  }

  return out.join('\n');
}
