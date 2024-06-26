import type { ClientOptions } from '../Options.ts';

export type SQLiteOptions = ClientOptions & {
  dialect: 'SQLITE';
  mode: 'MEMORY' | 'FILE';
  path?: string;
};
