import type {
  ColumnDefinition,
  ColumnType,
  SerialColumnDefinition,
} from './column/mod.ts';
import type { Expressions, ExpressionsType } from '../../../dam/mod.ts';
import type { SchemaDefinition } from './Schema.ts';
import type { TableDefinition } from './Table.ts';
import type { MakeOptional, MakeReadOnly } from '../../../utils/mod.ts';

/**
 * Gets the required (nullable: false) columns for a given model in a schema.
 * Expression columns will be excluded.
 *
 * @template S - The {@link SchemaDefinition}.
 * @template MN - The model name.
 * @returns {keyof S[MN]['columns']} - The required columns of the model.
 */
export type ModelRequiredColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends ColumnDefinition
    ? S[MN]['columns'][C] extends { nullable: true } ? never
    : C
    : never;
}[keyof S[MN]['columns']];

/**
 * Represents the optional columns of a model based on the schema definition.
 * Expression columns are considered as optional.
 *
 * @template S - The {@link SchemaDefinition}.
 * @template MN - The model name.
 * @returns {S[MN]['columns'][C]} - The optional columns of the model.
 */
export type ModelOptionalColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends ColumnDefinition
    ? S[MN]['columns'][C] extends { nullable: true } ? C
    : never
    : C;
}[keyof S[MN]['columns']];

/**
 * Retrieves the primary keys of a model in a schema definition.
 *
 * @template S - The {@link SchemaDefinition}.
 * @template MN - The model name.
 * @returns {S[MN]['primaryKeys'][number]} - The primary key(s) of the model.
 */
export type ModelPrimaryKeys<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = S[MN] extends TableDefinition
  ? S[MN]['primaryKeys'] extends Array<infer P> ? P : never
  : never;

/**
 * Represents the type of columns in a model that are inferred to be serial columns.
 *
 * @template S - The {@link SchemaDefinition}.
 * @template MN - The key of the model in the schema definition.
 * @returns {keyof S[MN]['columns']} - Columns whose type is Serial {@link SerialColumnDefinition}.
 */
export type ModelSerialColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
    SerialColumnDefinition ? C : never;
}[keyof S[MN]['columns']];

/**
 * Represents columns which are of type {@link Expressions} (Computed Columns).
 *
 * @template S - The schema {@link SchemaDefinition}.
 * @template MN - The key of the model in the {@link SchemaDefinition}.
 * @returns {keyof S[MN]['columns']} - Columns which are of type {@link Functions}.
 */
export type ModelExpressionColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends Expressions ? never
    : C;
}[keyof S[MN]['columns']];

/**
 * Represents columns which has default insert value.
 *
 * @template S - The {@link SchemaDefinition}.
 * @template MN - The key of the model in the {@link SchemaDefinition}.
 * @returns {keyof S[MN]['columns']} - Columns which has defaults.value defined
 */
export type ModelInsertDefaultColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
    { defaults: { insert: infer I } } ? C : never;
}[keyof S[MN]['columns']];

/**
 * Represents a type that extracts the column names from a model schema definition
 * where the `disableUpdate` property is set to `true`.
 *
 * @template S - The {@link SchemaDefinition}.
 * @template MN - The key of the model in the {@link SchemaDefinition}.
 * @returns {keyof S[MN]['columns']} - Columns which has disableUpdate set as true
 */
export type ModelDisableUpdateColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
    { disableUpdate: true } ? C : never;
}[keyof S[MN]['columns']];

/**
 * Represents the inferred column type based on the provided column definition or function.
 *
 * @template C - The {@link ColumnDefinition} type or {@link FunctionType}.
 * @returns The corresponding data type.
 */
export type ModelColumnType<C extends ColumnDefinition | Expressions> =
  C extends ColumnDefinition ? ColumnType<C>
    : C extends Expressions ? ExpressionsType<C>
    : never;

/**
 * Represents the inferred model type based on the provided schema definition. This will not
 * contain relationships etc.
 *
 * @template S - The {@link SchemaDefinition} type.
 * @template MN - The key of the schema definition.
 * @returns The corresponding model type.
 */
export type ModelType<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = MakeReadOnly<
  MakeOptional<
    {
      [C in keyof S[MN]['columns']]: ModelColumnType<S[MN]['columns'][C]>;
    },
    ModelOptionalColumns<S, MN>
  >,
  ModelPrimaryKeys<S, MN> | ModelSerialColumns<S, MN> | ''
> extends infer R ? { [C in keyof R]: R[C] } : never;

/**
 * Represents the type for inserting a model into a schema. It excludes computed columns,
 * auto incriment columns from the possible value list.
 *
 * @template S - The {@link SchemaDefinition}.
 * @template MN - The model name key of the schema.
 * @returns The corresponding insert model type.
 */
export type InsertModelType<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = Omit<
  MakeOptional<ModelType<S, MN>, ModelInsertDefaultColumns<S, MN>>,
  ModelSerialColumns<S, MN>
>;

/**
 * Represents the type used for updating a model in the database. It excludes computed columns,
 * serial/primary key columns and columns marked as non-updatable.
 *
 * @template S - The {@link SchemaDefinition}.
 * @template MN - The model name type.
 * @returns The corresponding update model type.
 */
export type UpdateModelType<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = Omit<
  Partial<ModelType<S, MN>>,
  ModelSerialColumns<S, MN> | ModelDisableUpdateColumns<S, MN>
>;

/**
 * Represents the inferred model relation type based on the provided schema definition.
 *
 * @template S - The {@link SchemaDefinition}.
 * @template MN - The key of the model in the schema definition.
 * @returns The corresponding model type with related models.
 */
export type ModelRelationType<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> =
  & ModelType<S, MN>
  & {
    [R in keyof S[MN]['foreignKeys']]?: S[MN]['foreignKeys'][R] extends
      { model: infer RM extends keyof S; contains: 'SINGLE' | 'MULTIPLE' }
      ? S[MN]['foreignKeys'][R] extends { contains: 'SINGLE' }
        ? ModelType<S, RM>
      : ModelType<S, RM>[]
      : never;
  } extends infer R ? { [C in keyof R]: R[C] } : never;
