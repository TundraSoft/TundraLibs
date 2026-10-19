/**
 * @module
 *
 * Where a {@link Migrator} reads its versioned snapshots from. The
 * default is a directory ({@link dirSource}); {@link memorySource} serves
 * snapshots a bundler inlined, for a runtime with no filesystem.
 *
 * @since 1.12.0
 */

import type { MigrationSnapshot } from './snapshot.ts';
import type { SqlDialect } from './plans.ts';

/** The versioned snapshots (and optional reviewed plans) a
 * {@link Migrator} applies. */
export type MigrationSource = {
  /** Where the snapshots live, for error messages and results. */
  readonly location: string;
  /** Available snapshot versions, ascending. */
  versions(): Promise<number[]>;
  /** The parsed snapshot for `version`; throws when there is none. */
  snapshot(version: number): Promise<MigrationSnapshot>;
  /** The stored `NNNN.<dialect>.sql` plan text, or `undefined` when
   * there is none — apply() then skips the review gate. */
  plan?(version: number, dialect: SqlDialect): Promise<string | undefined>;
};

/** A {@link MigrationSource} that `Migrator.snapshot()` and
 * `Migrator.renderPlans()` can write to. */
export type WritableMigrationSource = MigrationSource & {
  /** Where `writeSnapshot(version, …)` stores the snapshot. */
  snapshotPath(version: number): string;
  writeSnapshot(version: number, snapshot: MigrationSnapshot): Promise<void>;
  /** Where `writePlan(version, dialect, …)` stores the plan. */
  planPath(version: number, dialect: SqlDialect): string;
  writePlan(version: number, dialect: SqlDialect, text: string): Promise<void>;
};

/** Input for {@link memorySource}. */
export type MemorySourceInput = {
  /** Parsed `NNNN.json` snapshots keyed by version. */
  snapshots: Readonly<Record<number, MigrationSnapshot>>;
  /** Reviewed `NNNN.<dialect>.sql` plans keyed by version, then dialect. */
  plans?: Readonly<Record<number, Partial<Record<SqlDialect, string>>>>;
};

/**
 * A read-only source over snapshots held in memory — for a bundled app
 * that inlines its `NNNN.json` files, in a runtime with no filesystem.
 *
 * @throws {TypeError} When a snapshot key is not a positive integer.
 *
 * @example
 * ```ts ignore
 * import v1 from './migrations/0001.json' with { type: 'json' };
 * import v2 from './migrations/0002.json' with { type: 'json' };
 * const mig = new Migrator(db, { source: memorySource({ snapshots: { 1: v1, 2: v2 } }) });
 * await mig.apply();
 * ```
 */
export function memorySource(input: MemorySourceInput): MigrationSource {
  const versions = Object.keys(input.snapshots).map(Number);
  for (const v of versions) {
    if (!Number.isInteger(v) || v < 1) {
      throw new TypeError(
        `memorySource: snapshot keys must be positive integers, got '${v}'.`,
      );
    }
  }
  versions.sort((a, b) => a - b);
  return {
    location: 'memory',
    versions: () => Promise.resolve([...versions]),
    snapshot: (version) => {
      const snap = input.snapshots[version];
      return snap === undefined
        ? Promise.reject(new Error(`No snapshot for version ${version}.`))
        : Promise.resolve(snap);
    },
    plan: (version, dialect) =>
      Promise.resolve(input.plans?.[version]?.[dialect]),
  };
}
