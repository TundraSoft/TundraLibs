import type { QueryOption } from './Query/mod.ts';

export type ClientEvents = {
  connect(name: string): void;
  disconnect(name: string): void;
  error(name: string, error: Error): void;
  query(name: string, query: string, params: unknown[]): void;
  poolWait(name: string, size: number): void;
  longQuery(
    name: string,
    query: QueryOption,
    time: number,
    count: number,
  ): void;
};
