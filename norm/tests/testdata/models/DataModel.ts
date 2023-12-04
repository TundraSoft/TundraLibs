import { User } from './Users.ts';
import { Post } from './Posts.ts';
import type { DeepWritable } from '../../../types/mod.ts';

export const DefaultModel = {
  User,
  Post,
} as const;

export type DefaultModel = DeepWritable<typeof DefaultModel>;
