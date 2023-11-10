import { User } from './Users.ts';
import { Post } from './Posts.ts';

export const DefaultModel = {
  User,
  Post,
} as const;

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

export type DefaultModel = DeepWriteable<typeof DefaultModel>;
