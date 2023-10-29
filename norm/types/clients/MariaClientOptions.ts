import { ClientOptions } from './ClientOptions.ts';

export type MariaClientOptions = ClientOptions & {
  dialect: 'MARIADB';
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
  // Connection timeout in seconds
  connectionTimeout?: number;
  poolSize?: number;
  // Idle connection timeout in minutes
  idleTimeout?: number;
};
