import { DAMError } from '../../errors/mod.ts';
import { type Query } from '../query/mod.ts';

export type ClientEvents = {
  connect: (name: string) => void;
  close: (name: string) => void;
  query: (
    name: string,
    duration: number,
    query: Query,
    isSlow: boolean,
    resultCount?: number,
    error?: DAMError,
  ) => void;
  error: (name: string, type: 'CONNECTION' | 'QUERY', error: DAMError) => void;
  poolLimit: (name: string, limit: number, query: Query) => void;
};
