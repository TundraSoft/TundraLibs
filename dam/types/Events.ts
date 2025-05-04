import type { Query, QueryResult } from './Query.ts';
import { DAMEngineError } from '../errors/mod.ts';
export type EngineEvents = {
  query: (
    name: string,
    query: Query,
    result?: QueryResult,
    error?: DAMEngineError,
  ) => void | Promise<void>;
  error: () => void | Promise<void>;
};
