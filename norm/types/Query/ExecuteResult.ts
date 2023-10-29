import type { QueryTypes } from './QueryTypes.ts';

export type ExecuteResult = {
  type: QueryTypes;
  time: number;
};
