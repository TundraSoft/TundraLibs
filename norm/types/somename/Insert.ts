import type { BaseQuery } from './Base.ts';

export type InsertQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = BaseQuery<M> & {
  type: 'INSERT';
  values: Record<string, unknown> | Record<string, unknown>[];
};
