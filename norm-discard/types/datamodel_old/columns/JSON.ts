import type { BaseColumnDefinition } from './Base.ts';
import type { JSONDataType } from '../../datatypes/mod.ts';

type JSONStructure = {
  [key: string]: {
    nullable?: boolean;
    type: 'string' | 'number' | 'bigint' | 'boolean' | 'Date' | JSONStructure;
  };
};

export type JSONColumnDefinition = BaseColumnDefinition & {
  type: JSONDataType;
  structure?: JSONStructure;
};

type JSONColumnType<T extends JSONStructure> = T extends { isArray: true }
  ? Array<JSONColumnType<T>>
  : JSONColumnType<T>;

const _d: JSONColumnDefinition = {
  type: 'JSON',
  structure: {
    'sdf': {
      type: 'string',
      nullable: true,
    },
  },
};

type _e = JSONColumnType<typeof _d['structure']>;
