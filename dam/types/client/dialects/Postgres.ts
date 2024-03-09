import type { ClientOptions } from '../Options.ts';

export type PostgresOptions = ClientOptions & {
  dialect: 'POSTGRES';
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  poolSize?: number;
  tls?: {
    enabled: boolean;
    certificates?: string[];
    verify?: boolean;
  };
};
