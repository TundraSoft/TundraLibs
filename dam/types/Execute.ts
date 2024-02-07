import type { QueryTypes } from './Types.ts';

export type QueryExecute = {
  type: QueryTypes;
  time: number; // Time taken for execution
  sql: string;
  params?: Record<string, unknown>;
};
