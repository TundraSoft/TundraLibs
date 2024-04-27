import { DAMError } from '../../errors/mod.ts';

export type ClientEvents = {
  connect: (name: string) => void;
  close: (name: string) => void;
  query: (
    name: string,
    duration: number,
    query: string,
    params?: Record<string, unknown>,
    resultCount?: number,
  ) => void;
  error: (name: string, error: DAMError) => void;
  slowQuery: (
    name: string,
    duration: number,
    query: string,
    params?: Record<string, unknown>,
  ) => void;
};
