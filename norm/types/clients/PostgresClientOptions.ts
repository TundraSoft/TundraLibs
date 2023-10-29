import { ClientOptions } from './ClientOptions.ts';

export type PostgresClientOptions = ClientOptions & {
  dialect: 'POSTGRES';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
  poolSize?: number;
};
