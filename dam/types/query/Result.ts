import { QueryTypes } from './Types.ts';

export type QueryResult<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: QueryTypes;
  time: number;
  count: number;
  data: R[];
};
