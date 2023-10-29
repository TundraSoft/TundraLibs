import type { Dialects } from '../Dialects.ts';

export type ClientEvents = {
  connect: (name: string, dialect: Dialects) => void;
  disconnect: (name: string, dialect: Dialects) => void;
  error: (name: string, dialect: Dialects, err: Error) => void;
};
