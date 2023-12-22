import { ConnectionOptions } from '../Options.ts';

export type MariaConnectionOptions = ConnectionOptions & {
  host: string;
  username: string;
  password: string;
  database: string;
  port?: number;
  poolSize?: number;
  connectionTimeout?: number;
  idleTimeout?: number;
  tls?: {
    sslMode: 'disabled' | 'verify_identity';
    caCerts?: string[];
  };
};
