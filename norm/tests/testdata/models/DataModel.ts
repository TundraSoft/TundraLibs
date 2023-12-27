import { User } from './Users.ts';
import { Post } from './Posts.ts';
import type { DeepWritable } from '../../../types/mod.ts';

export const DefaultModel = {
  User,
  Post,
} as const;

export type DefaultModel = DeepWritable<typeof DefaultModel>;

import type { SelectQuery } from '../../../types/Query/mod.ts';

const _a: SelectQuery<DefaultModel, 'Post'> = {
  name: 'Post',
  schema: 'public',
  columns: {
    Id: 'id',
    Title: 'title',
    Content: 'content',
    CreatedBy: 'created_by',
    ReviewdBy: 'reviewed_by',
    CreatedAt: 'created_at',
  },
  filter: {
    Id: {
      $eq: 1,
    },
  },
  project: ['Id', 'Title', 'Content'],
  orderBy: [
    ['Id', 'ASC'],
  ],
  limit: 10,
  offset: 0,
  with: {
    'Author': {
      name: 'User',
      schema: 'public',
      columns: {
        Id: 'id',
        Name: 'name',
        Email: 'email_address',
        Password: 'password',
        CreatedAt: 'created_at',
      },
      relation: {
        CreatedBy: 'Id',
      },
      project: ['Id', 'Name', 'Email'],
      filter: {
        Id: {
          $eq: 1,
        },
      },
    },
  },
};

export type UnionToIntersection<U> =
  (U extends Record<string, unknown> ? (k: U) => void
    : never) extends ((k: infer I) => void)
    ? I extends infer O ? { [D in keyof O]: O[D] } : never
    : never;

export type Unarray<T> = T extends Array<infer U> ? U : T;

type KeyCombiner<Parent extends string = '', K extends string = ''> =
  `${Parent}${Parent extends '' ? '' : '.'}${K}`;

export type FlattenEntity<
  T extends Record<string, unknown> = Record<string, unknown>,
  Parent extends string = '',
> = UnionToIntersection<
  {
    [K in keyof T]: T[K] extends Array<Record<string, unknown>>
      ? FlattenEntity<Unarray<T[K]>, KeyCombiner<Parent, K & string>>
      : T[K] extends Record<string, unknown>
        ? FlattenEntity<T[K], KeyCombiner<Parent, K & string>>
      : { [KK in KeyCombiner<Parent, K & string>]: Unarray<T[K]> };
  }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never
>;

type a = FlattenEntity<DefaultModel['Post']['columns']>;

/*

{
  name: 'Post',
  schema: 'public',
  columns: {
    Id: 'id',
    Title: 'title',
    Content: 'content',
    CreatedBy: 'created_by',
    ReviewdBy: 'reviewed_by',
    CreatedAt: 'created_at',
  },
  relations: {
    'Author': {}
  },
  // Can be from both columns and relations
  filters: {

  },
  project: {
  },
}
*/
