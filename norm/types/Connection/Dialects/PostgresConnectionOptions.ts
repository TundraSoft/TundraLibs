import { ConnectionOptions } from '../Options.ts';

export type PostgresConnectionOptions = ConnectionOptions & {
  host: string;
  username: string;
  password: string;
  database: string;
  port?: number;
  poolSize?: number;
  tlsOptions?: {
    enabled: boolean;
    enforce: boolean;
    certificate?: string;
  };
};
