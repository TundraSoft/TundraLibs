import type { ClientOptions } from '../Options.ts';

export type PostgresOptions = ClientOptions & {
  dialect: 'POSTGRES';
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  poolSize?: number;
  connectionTimeout?: number; // Connection timeout is in seconds. Must be between 1 and 30 - NOTE DOES NOT WORK
  lazy: boolean;
  tls?: {
    enabled: boolean;
    certificates?: string[];
    verify?: boolean;
  };
};
