import type { ClientOptions } from '../Options.ts';

export type MariaOptions = ClientOptions & {
  dialect: 'MARIA';
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  connectionTimeout?: number;
  idleTimeout?: number;
  tls?: {
    sslMode: 'disabled' | 'verify_identity';
    caCerts?: string[];
  };
};
