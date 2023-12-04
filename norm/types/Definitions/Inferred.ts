import { TableDefinition } from './Table.ts';
import { ColumnType } from './Column.ts';

// Primary Keys
export type TablePrimaryKey<T extends TableDefinition> = T extends
  { primaryKeys: string[] } ? Extract<
    keyof T['columns'],
    T['primaryKeys'][number]
  >
  : never;

export type TableStringColumns<M extends TableDefinition> = {
  [C in keyof M['columns']]: ColumnType<M['columns'][C]['type']> extends string
    ? C
    : never;
}[keyof M['columns']];

export type TableNumericColumns<M extends TableDefinition> = {
  [C in keyof M['columns']]: ColumnType<M['columns'][C]['type']> extends number
    ? C
    : never;
}[keyof M['columns']];

export type TableDateColumns<M extends TableDefinition> = {
  [C in keyof M['columns']]: ColumnType<M['columns'][C]['type']> extends Date
    ? C
    : never;
}[keyof M['columns']];

export type TableBooleanColumns<M extends TableDefinition> = {
  [C in keyof M['columns']]: ColumnType<M['columns'][C]['type']> extends boolean
    ? C
    : never;
}[keyof M['columns']];

export type TableNullableColumns<M extends TableDefinition> = {
  [C in keyof M['columns']]: M['columns'][C] extends { nullable: true } ? C
    : never;
}[keyof M['columns']];

export type TableRequiredColumns<M extends TableDefinition> = {
  [C in keyof M['columns']]: M['columns'][C] extends { nullable: false } ? C
    : never;
}[keyof M['columns']];
