import { ConnectionOptions } from '../Options.ts';

export type MariaConnectionOptions = ConnectionOptions & {
  host: string;
  username: string;
  password: string;
  database: string;
  port?: number;
  poolSize?: number;
  ssl?: boolean;
  connectionTimeout?: number;
  idleTimeout?: number;
};
