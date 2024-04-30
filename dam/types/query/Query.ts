import type { QueryResult } from './Result.ts';
import type { QueryFilters } from './filter/mod.ts';
import type { ColumnIdentifier } from '../ColumnIdentifier.ts';
import type { Aggregate } from '../Aggregate.ts';
import { DataTypes, Expressions } from '../mod.ts';

export type Query = {
  type?: 'RAW';
  sql: string;
  params?: Record<string, unknown>;
};

type QueryFunction = (res: QueryResult) => Query | QuerySet;

export type QuerySet = Array<
  Query & {
    finalReturn?: boolean;
  }
>;

//#region DML Queries
export type JoinSegment = {
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  relation: Record<string, ColumnIdentifier>;
};

export type InsertQuery = {
  type: 'INSERT';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  values: Record<string, unknown>[];
  project: Record<
    string,
    Expressions | string | number | boolean | Date
  >;
};

export type UpdateQuery = {
  type: 'UPDATE';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  data: Record<string, unknown>;
  filters?: Record<string, unknown>;
};

export type DeleteQuery = {
  type: 'DELETE';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  filters?: Record<string, unknown>;
};

export type SelectQuery = {
  type: 'SELECT';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  filters?: QueryFilters;
  project: Record<
    string,
    | Expressions
    | Aggregate
    | string
    | number
    | boolean
    | Date
  >;
  joins?: Record<string, JoinSegment>;
  groupBy?: ColumnIdentifier[];
  orderBy?: Record<ColumnIdentifier, 'ASC' | 'DESC'>;
  limit?: number;
  offset?: number;
};

export type CountQuery = {
  type: 'COUNT';
  source: string;
  schema?: string;
  columns: string[];
  expressions?: Record<string, Expressions>;
  filters?: QueryFilters;
  joins?: Record<string, JoinSegment>;
};

export type TruncateQuery = {
  type: 'TRUNCATE';
  source: string;
  schema?: string;
};

export type CreateSchemaQuery = {
  type: 'CREATE_SCHEMA';
  schema: string;
};

export type DropSchemaQuery = {
  type: 'DROP_SCHEMA';
  schema: string;
  cascade?: boolean;
};

export type CreateTableColumnDefinition = {
  type: DataTypes;
  nullable?: boolean;
  length?: [number, number?];
};

export type CreateTableQuery = {
  type: 'CREATE_TABLE';
  source: string;
  schema?: string;
  columns: Record<string, CreateTableColumnDefinition>;
  primaryKeys?: string[];
  uniqueKeys?: Record<string, string[]>;
  foreignKeys?: Record<
    string,
    Pick<JoinSegment, 'schema' | 'source' | 'relation'>
  >;
};

export type AlterTableQuery = {
  type: 'ALTER_TABLE';
  source: string;
  schema?: string;
  addColumns?: Record<string, CreateTableColumnDefinition>;
  dropColumns?: string[];
  renameColumns?: Record<string, string>;
  alterColumns?: Record<string, CreateTableColumnDefinition>;
};

export type RenameTableQuery = {
  type: 'RENAME_TABLE';
  source: string;
  schema?: string;
  newSource: string;
  newSchema?: string;
};

export type DropTableQuery = {
  type: 'DROP_TABLE';
  source: string;
  schema?: string;
};

export type CreateViewQuery = {
  type: 'CREATE_VIEW';
  source: string;
  schema?: string;
  materialized?: boolean;
  query: SelectQuery;
};

export type AlterViewQuery = {
  type: 'ALTER_VIEW';
  source: string;
  schema?: string;
  materialized?: boolean;
  query: SelectQuery;
};

export type RenameViewQuery = {
  type: 'RENAME_VIEW';
  source: string;
  schema?: string;
  newSource: string;
  newSchema?: string;
};

export type DropViewQuery = {
  type: 'DROP_VIEW';
  source: string;
  schema?: string;
  materialized?: boolean;
};
//#endregion DML Queries
