import { RemoteServerConnectionOptions } from '../Options.ts';

export type MariaConnectionOptions = RemoteServerConnectionOptions & {
  poolSize?: number;
  ssl?: boolean;
  connectionTimeout?: number;
  idleTimeout?: number;
};
