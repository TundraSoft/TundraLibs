/**
 * @module
 *
 * Stored, reviewable migration plans. `snapshot()` renders the DDL a
 * version will run — per SQL dialect, capability-correct — into
 * `000N.<dialect>.sql` files next to the snapshot. The artifacts are
 * REVIEW material (they go through PRs like hand-written migrations
 * would), and they are ENFORCED: `apply()` recomputes its own
 * dialect's plan, hashes it, and REFUSES when the hash no longer
 * matches the stored artifact — so what production executes is
 * exactly what was reviewed, regardless of who re-generated what in
 * between.
 *
 * Artifacts always render with `allowDrop: true`: reviewers must SEE
 * the drops a version implies; the apply-time allowDrop gate is a
 * separate, unchanged check.
 *
 * Rebuild steps render their real DDL bracket (from the SAME
 * {@linkcode rebuildDdlPlan} the executor consumes) with the copy and
 * verification steps as comments — those run through the engine
 * seam / per-row JS, not as reviewable SQL.
 *
 * @since 1.0.0
 */

import {
  MariaTranslator,
  PostgresTranslator,
  SQLiteTranslator,
} from '@tundralibs/oql/translator';
import type { DdlQuery } from '../executor.ts';
import type { MigrationAction } from './rebuild.ts';
import { isRebuild, rebuildDdlPlan } from './rebuild.ts';
import { fnv1a64 } from './snapshot.ts';

/** Dialects that get plan artifacts (Mongo DDL is mostly no-op). */
export const SQL_DIALECTS = ['sqlite', 'postgres', 'maria'] as const;
/** One of the SQL dialects that a reviewable `.sql` plan is rendered
 * for — a member of {@link SQL_DIALECTS}. */
export type SqlDialect = (typeof SQL_DIALECTS)[number];

const HASH_PREFIX = '-- plan-hash: ';

/** `0007.postgres.sql` — never matches the snapshot version regex. */
export function planFilename(version: number, dialect: SqlDialect): string {
  return `${String(version).padStart(4, '0')}.${dialect}.sql`;
}

function translatorFor(dialect: SqlDialect) {
  switch (dialect) {
    case 'sqlite':
      return new SQLiteTranslator();
    case 'postgres':
      return new PostgresTranslator();
    case 'maria':
      return new MariaTranslator();
  }
}

type AnyTranslator = ReturnType<typeof translatorFor>;

function ddlStatements(t: AnyTranslator, q: DdlQuery): string[] {
  switch (q.type) {
    case 'CREATE_SCHEMA':
      return [t.createSchema(q).sql];
    case 'CREATE_TABLE':
      return t.createTable(q).map((s) => s.sql);
    case 'ALTER_TABLE':
      return t.alterTable(q).map((s) => s.sql);
    case 'DROP_TABLE':
      return [t.dropTable(q).sql];
    case 'CREATE_VIEW':
      return [t.createView(q).sql];
    case 'DROP_VIEW':
      return [t.dropView(q).sql];
    case 'CREATE_INDEX':
      return [t.createIndex(q).sql];
    case 'DROP_INDEX':
      return [t.dropIndex(q).sql];
  }
}

/** A rendered per-dialect plan artifact plus its verification hash. */
export type RenderedPlan = {
  /** Executable statements only (comments excluded) — the hash input. */
  readonly statements: string[];
  /** FNV-1a 64 over the JSON statement list. */
  readonly hash: string;
  /** The full artifact file body. */
  readonly text: string;
};

/**
 * Render one version's action list for one dialect. Deterministic:
 * the SAME actions always produce the SAME hash, and the executor
 * consumes the same builders this renders from.
 */
export function renderPlan(
  version: number,
  dialect: SqlDialect,
  actions: ReadonlyArray<MigrationAction>,
): RenderedPlan {
  const t = translatorFor(dialect);
  const statements: string[] = [];
  const lines: string[] = [];

  for (const action of actions) {
    if (!isRebuild(action)) {
      for (const sql of ddlStatements(t, action)) {
        statements.push(sql);
        lines.push(`${sql};`);
      }
      continue;
    }
    const plan = rebuildDdlPlan(action);
    lines.push(
      `-- REBUILD '${action.entityKey}' (${
        action.transform ? 'crypto transform' : 'structural'
      }): old table survives as '${plan.aside}' until row counts verify`,
    );
    for (const q of plan.preCopy) {
      for (const sql of ddlStatements(t, q)) {
        statements.push(sql);
        lines.push(`${sql};`);
      }
    }
    if (plan.structuralCopy !== null) {
      const copy = t.insertQuery(plan.structuralCopy);
      statements.push(copy.sql);
      lines.push(`${copy.sql};`);
    } else {
      lines.push(
        `-- (copy step runs per-row in the migrator: decrypt/re-encrypt/` +
          `digest-backfill — not expressible as SQL)`,
      );
    }
    lines.push(`-- (row counts verified before the aside table drops)`);
    for (const q of plan.postCopy) {
      for (const sql of ddlStatements(t, q)) {
        statements.push(sql);
        lines.push(`${sql};`);
      }
    }
  }

  const hash = fnv1a64(JSON.stringify(statements));
  const text = [
    `-- norm migration plan v${String(version).padStart(4, '0')} — ` +
    `dialect: ${dialect}`,
    `${HASH_PREFIX}${hash}`,
    `-- REVIEW ARTIFACT. apply() recomputes this dialect's plan and`,
    `-- REFUSES when its hash differs from the line above. Regenerate`,
    `-- with Migrator.renderPlans() after editing definitions.`,
    '',
    ...lines,
    '',
  ].join('\n');
  return { statements, hash, text };
}

/** Extract the stored hash from an artifact body (null = malformed). */
export function storedPlanHash(text: string): string | null {
  for (const line of text.split('\n', 8)) {
    if (line.startsWith(HASH_PREFIX)) {
      const h = line.slice(HASH_PREFIX.length).trim();
      return h.length > 0 ? h : null;
    }
  }
  return null;
}
