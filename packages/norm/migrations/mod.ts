/**
 * @module
 *
 * Migrations subpath — `import { Migrator } from
 * '@tundralibs/norm/migrations'`. Deliberately NOT re-exported from
 * the package root: migrations are an operational concern, out of the
 * request path and out of app bundles.
 *
 * @since 1.0.0
 */

export {
  type ApplyOptions,
  type ApplyResult,
  Migrator,
  type MigratorOptions,
  type MigratorStatus,
  type PlannedStep,
  type SnapshotResult,
} from './Migrator.ts';
export {
  type DiffOptions,
  type DiffResult,
  diffSnapshots,
  fkName,
  indexName,
  uniqueIndexName,
} from './diff.ts';
export {
  buildSnapshot,
  fnv1a64,
  type MigrationSnapshot,
  type SnapColumn,
  type SnapEntity,
  type SnapForeignKey,
  snapshotHash,
} from './snapshot.ts';
export {
  isRebuild,
  type MigrationAction,
  rebuildDdlPlan,
  type RebuildPlan,
  type RebuildTable,
} from './rebuild.ts';
export {
  planFilename,
  type RenderedPlan,
  renderPlan,
  SQL_DIALECTS,
  type SqlDialect,
  storedPlanHash,
} from './plans.ts';
export { formatVersionFilename, parseVersion } from './version.ts';
export {
  HISTORY_TABLE_NAME,
  historyCreateQuery,
  type HistoryRow,
} from './history.ts';
export {
  PROGRESS_TABLE_NAME,
  progressCreateQuery,
  type ProgressRow,
} from './progress.ts';
export { DEFAULT_STALE_MS, FileLock } from './FileLock.ts';
