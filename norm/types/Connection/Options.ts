import { Dialects } from '../Dialects.ts';

export type ConnectionOptions = {
  dialect: Dialects;
  encryptionKey?: string;
};

export type RemoteServerConnectionOptions = ConnectionOptions & {
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  poolSize?: number;
};

export type FlatFileConnectionOptions = ConnectionOptions & {
  mode: 'MEMORY' | 'FILE';
  filePath?: string;
};
