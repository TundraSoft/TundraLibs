/**
 * Definition layer — Guardian-style builders emitting plain data.
 *
 * ```ts ignore
 * const Users = Entity('users', {
 *   id: Column.uuid().default({ $$_expression: 'UUID' }),
 *   email: Column.varchar(255).pattern(/^\S+@\S+$/).encrypt().hash(),
 *   status: Column.varchar(16).lov(['active', 'banned']), // 'active' | 'banned'
 *   age: Column.integer().min(0).nullable(),
 * }, { pk: ['id'] });
 *
 * export const Blog = Schema('Blog', { Users });
 * const registry = use(Blog, Stats);
 * type Row = RowOf<typeof Users>;
 * ```
 *
 * @module norm/definition
 */

export {
  type AnyColumnBuilder,
  Column,
  ColumnBuilder,
  type ColumnSpec,
  DateColumnBuilder,
  type DefaultInput,
  DIGEST_LENGTHS,
  type DigestAlgorithm,
  DigestColumnBuilder,
  EncryptedColumnBuilder,
  type ExpressionDefault,
  HashedColumnBuilder,
  MaskColumnBuilder,
  NumberColumnBuilder,
  StringColumnBuilder,
} from './Column.ts';
export { hashSiblingOf, hashSourceOf } from './Column.ts';
export {
  type AuditDefinition,
  type AuditTableOptions,
  type EmittedAudit,
  type EmittedForeignKey,
  type EmittedHooks,
  type EmittedReadHooks,
  type EmittedTemporal,
  Entity,
  type EntityQueryOptions,
  type EntityTableOptions,
  type EntityViewOptions,
  type ForeignKeyDef,
  type QueryDefinition,
  type ReadHooks,
  type TableDefinition,
  type TableHooks,
  type TemporalTableOptions,
  type ViewDefinition,
} from './entity.ts';
export {
  type AnyDefinition,
  type ComposedSchema,
  Schema,
  type SchemaDefinition,
  type SchemaValue,
  use,
} from './schema.ts';
export { toMarkdown, toMermaidERD, toPlantUML } from './docs.ts';
export {
  type ColumnSnapshot,
  type EntitySnapshot,
  type Snapshot,
  snapshot,
} from './snapshot.ts';
export type {
  InsertOf,
  PrimaryKeyOf,
  ReadRowOf,
  RowOf,
  ScopedInsertOf,
  UpdateOf,
} from './infer.ts';
export type {
  DefaultRowOf,
  ProjectedRowOf,
  ProjectionInput,
  ValidProjection,
} from './projected.ts';
export type { FilterOf, FilterShapeOf } from './filter.ts';
