/**
 * `@tundralibs/norm/core` — norm's ENTIRE surface (definition layer +
 * runtime), with NO engine registered.
 *
 * Identical to the root `@tundralibs/norm` barrel except for one thing:
 * the root barrel also imports all seven `engines/<dialect>` modules, so
 * `new Norm({ database: { dialect } })` works out of the box for every
 * dialect — and, as a consequence, every driver (including the native
 * SQLite adapter and its `bun:sqlite` / `@db/sqlite` specifiers) is in
 * the bundle. That is fine on a server and fatal on an edge runtime.
 *
 * Import from here on Cloudflare Workers / Vercel Edge / Vite, and add
 * only the engine you actually use:
 *
 * ```ts ignore
 * import '@tundralibs/norm/engines/d1';
 * import { Norm } from '@tundralibs/norm/core';
 *
 * const norm = new Norm({ database: { dialect: 'd1', accountId, databaseId, apiToken } });
 * ```
 *
 * A dialect whose module was not imported fails at construction with a
 * `NormError` (`ENGINE_NOT_REGISTERED`) naming the import to add.
 *
 * @module
 */

// ─── Runtime ─────────────────────────────────────────────────────────
export { type DatabaseConfig, Norm, type NormConfig, NormDb } from './Norm.ts';
export {
  type NormDialect,
  type NormEngineFactory,
  registerEngine,
  resolveEngineFactory,
} from './engines/mod.ts';
export { coerceCount, type NormResult, ulid } from './result.ts';
export {
  rotateKey,
  type RotateKeyEntityReport,
  type RotateKeyOptions,
  type RotateKeyProgress,
  type RotateKeyReport,
} from './rotate.ts';
export type { NormScope, ScopeInput, ScopeValue } from './scope.ts';
export {
  type FindOptions,
  QueryAccessor,
  ReadRepo,
  Repo,
  type RepoFor,
} from './Repo.ts';
export {
  type AnySQLEngine,
  bindTx,
  type Executor,
  type ExecutorCapabilities,
  type ExecutorQuery,
  mongoExecutor,
  type NormDMLQuery,
  type Session,
  sqlExecutor,
} from './executor.ts';
export {
  type CompiledEntity,
  compileRuntime,
  type NormCrypto,
  type NormEmit,
  type NormEvents,
  type ReverseMap,
  type ReverseRelation,
  type Runtime,
  type Witness,
  type WitnessInfo,
} from './compile.ts';
export {
  buildCellGuardian,
  buildWriteGuardians,
  validateRows,
  type WriteGuardians,
} from './guardians.ts';
export {
  canonicalizePlain,
  type CryptoOverrides,
  decodePlain,
  DEFAULT_ENCRYPT_ALGORITHM,
  DEFAULT_HASH_ALGORITHM,
  type EncryptAlgorithm,
  type HashAlgorithm,
  pbkdf2Verify,
  SIBLING_HASH_ALGORITHM,
} from './crypto.ts';
export {
  type AdvisoryLockErrorMeta,
  type CryptoErrorMeta,
  type DefinitionIssue,
  NormAdvisoryLockError,
  NormCryptoError,
  NormDefinitionError,
  NormError,
  type NormErrorCode,
  NormHookError,
  NormQueryError,
  NormUnsupportedError,
  NormValidationError,
  type QueryErrorMeta,
  type ValidationIssue,
} from './errors/mod.ts';

// ─── Definition layer ────────────────────────────────────────────────

export {
  type AnyColumnBuilder,
  type AnyDefinition,
  Column,
  ColumnBuilder,
  type ColumnSnapshot,
  type ColumnSpec,
  type ComposedSchema,
  DateColumnBuilder,
  type DefaultInput,
  type DefaultRowOf,
  DIGEST_LENGTHS,
  type DigestAlgorithm,
  DigestColumnBuilder,
  type EmittedForeignKey,
  EncryptedColumnBuilder,
  Entity,
  type EntityQueryOptions,
  type EntitySnapshot,
  type EntityTableOptions,
  type EntityViewOptions,
  type ExpressionDefault,
  type FilterOf,
  type FilterShapeOf,
  type ForeignKeyDef,
  HashedColumnBuilder,
  type InsertOf,
  MaskColumnBuilder,
  NumberColumnBuilder,
  type PrimaryKeyOf,
  type ProjectedRowOf,
  type ProjectionInput,
  type QueryDefinition,
  type ReadHooks,
  type ReadRowOf,
  type RowOf,
  Schema,
  type SchemaDefinition,
  type SchemaValue,
  type Snapshot,
  snapshot,
  StringColumnBuilder,
  type TableDefinition,
  type TableHooks,
  toMarkdown,
  toMermaidERD,
  toPlantUML,
  type UpdateOf,
  use,
  type ViewDefinition,
} from './definition/mod.ts';
