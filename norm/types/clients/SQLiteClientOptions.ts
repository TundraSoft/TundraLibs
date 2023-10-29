import { ClientOptions } from './ClientOptions.ts';

export type SQLiteClientOptions = ClientOptions & {
  dialect: 'SQLITE';
  type: 'MEMORY' | 'FILE';
  mode: 'read' | 'write' | 'create';
  path?: string;
};
