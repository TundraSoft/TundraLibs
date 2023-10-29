import { Schema, TableDefinition } from '../../types/schema/mod.ts';
import {
  DeleteQuery,
  InsertQuery,
  QueryFilters,
  UpdateQuery,
} from '../../types/query/mod.ts';
import { DataTypeMap } from '../../const/mod.ts';
import { SchemaDefinition } from '../../../old/norm/mod.ts';

const SchemaDefinition = {
  Users: {
    primaryKeys: ['Id'],
    name: 'USERS',
    schema: 'UserGroup',
    columns: {
      Id: {
        name: 'ID',
        type: 'INTEGER',
        nullable: false,
      },
      Name: {
        name: 'UserName',
        type: 'VARCHAR',
        nullable: false,
      },
      Password: {
        name: 'Pass',
        type: 'VARCHAR',
        nullable: false,
      },
      DOB: {
        name: 'DOB',
        type: 'DATE',
        nullable: true,
      },
      JoinDate: {
        name: 'CreatedDate',
        type: 'DATETIME',
        nullable: false,
      },
    },
  },

  Groups: {
    name: 'GROUPS',
    schema: 'UserGroup',
    columns: {
      Id: {
        name: 'ID',
        type: 'INTEGER',
        nullable: false,
      },
      Name: {
        name: 'GroupName',
        type: 'VARCHAR',
        nullable: false,
      },
    },
    // primaryKeys: ["Id"],
  },
} as const;

type a = typeof SchemaDefinition;
type d = a['Users']['primaryKeys'];

type Unarray<T> = T extends Array<infer U> ? U : T;

type SchemaBuilder<S extends Schema> = {
  -readonly [T in keyof S]: {
    _meta: {
      name: S[T]['name'];
      primaryKeys?: S[T] extends { primaryKeys: readonly string[] }
        ? S[T]['primaryKeys']
        : never;
      columns: {
        [C in keyof S[T]['columns']]: S[T]['columns'][C]['name'];
      };
    };
    columns:
      & {
        -readonly [
          // fetch non nullable first
          C in keyof S[T]['columns'] as S[T]['columns'][C]['nullable'] extends
            false ? C : never
        ]: ReturnType<typeof DataTypeMap[S[T]['columns'][C]['type']]>;
      }
      & {
        -readonly [
          // fetch nullable afterwards
          C in keyof S[T]['columns'] as S[T]['columns'][C]['nullable'] extends
            true ? C : never
        ]?: ReturnType<typeof DataTypeMap[S[T]['columns'][C]['type']]>;
      } extends infer O ? { [K in keyof O]: O[K] } : never;
  };
};

type SchemaDefinitions = SchemaBuilder<typeof SchemaDefinition>;

type ComputedColumns<
  S extends Schema = Record<string, TableDefinition>,
  T extends keyof S = keyof S,
  SD extends SchemaBuilder<S> = SchemaBuilder<S>,
> =
  | { add: Array<keyof SD[T]['columns'] | number> }
  | { sub: Array<keyof SD[T]['columns'] | number> }
  | { mul: Array<keyof SD[T]['columns'] | number> }
  | { div: Array<keyof SD[T]['columns'] | number> };

type BaseQuery<
  S extends Schema = Record<string, TableDefinition>,
  T extends keyof S = keyof S,
  SD extends SchemaBuilder<S> = SchemaBuilder<S>,
> = {
  schema?: S[T]['schema'];
  table: S[T]['name'];
  columns: SD[T]['_meta']['columns'];
  project?:
    | {
      [C in keyof SD[T]['_meta']['columns']]?: boolean;
    }
    | {
      [alias: string]: ComputedColumns<S, T, SD>;
    } extends infer O ? { [K in keyof O]: O[K] } : never;
};

type InsertQuery2<
  S extends Schema = Record<string, TableDefinition>,
  T extends keyof S = keyof S,
> = BaseQuery<S, T> & {
  values: {
    [C in keyof S[T]['columns']]?: S[T]['columns'][C] extends { type: unknown }
      ? ReturnType<typeof DataTypeMap[S[T]['columns'][C]['type']]>
      : unknown;
  }[];
};

const a: BaseQuery<typeof SchemaDefinition, 'Users'> = {
  table: 'USERS',
  columns: {
    Id: 'ID',
    Name: 'UserName',
    Password: 'Pass',
    DOB: 'DOB',
    JoinDate: 'CreatedDate',
  },
  project: {
    Id: true,
    Name: true,
    DDD: {
      add: ['Id'],
    },
  },
};

type QueryDefaults<
  T extends Schema = Record<string, TableDefinition>,
  K extends keyof T = keyof T,
> = {
  schema?: T[K]['schema'];
  table: T[K]['name'];
  // Column will be record of alias: column name. From Schema[K]['columns']
  columns: {
    [C in keyof T[K]['columns']]: T[K]['columns'][C]['name'];
  };
  project?: {
    [alias: string]: boolean; // Add support for computed columns
  };
};
