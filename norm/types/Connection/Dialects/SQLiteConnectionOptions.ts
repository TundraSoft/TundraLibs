import { ConnectionOptions } from '../Options.ts';

export type SQLiteConnectionOptions = ConnectionOptions & {
  mode: 'MEMORY' | 'FILE';
  filePath?: string;
};
