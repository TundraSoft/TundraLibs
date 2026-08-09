/**
 * @tundralibs/norm — definition layer (builders, entities, named
 * schemas, docs, snapshots) + runtime (Norm facade, generated-Guardian
 * validation, repos over the executor seam).
 *
 * ```ts
 * const norm = new Norm({ database: {...}, secret });
 * const db = norm.use(Blog, Stats);
 * await db.repo('Users').insert({ email: 'a@b.c', ... });
 * ```
 *
 * @module
 */

// ─── Runtime ─────────────────────────────────────────────────────────
export { type DatabaseConfig, Norm, type NormConfig, NormDb } from './Norm.ts';
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
