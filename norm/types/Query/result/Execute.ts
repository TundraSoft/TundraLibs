import { QueryTypes } from '../Types.ts';

export type QueryExecute = {
  time: number;
  type: QueryTypes;
  sql?: string;
};
