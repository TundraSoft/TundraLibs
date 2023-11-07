import { Dialects } from './Dialects.ts';
import { NormBaseError } from '../errors/mod.ts';

export type NormEvents = {
  connect: (name: string, dialect: Dialects) => void;
  close: (name: string, dialect: Dialects) => void;
  query: (name: string, dialect: Dialects, query: string) => void;
  error: (
    name: string,
    dialect: Dialects,
    error: NormBaseError,
    query?: string,
  ) => void;
};
