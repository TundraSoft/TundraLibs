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
      filter: {
        Id: {
          $eq: 1,
        },
      },
    },
  },
};
