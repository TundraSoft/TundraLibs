import type { ClientOptions } from '../Options.ts';

export type MariaOptions = ClientOptions & {
  dialect: 'MARIA';
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  connectionTimeout?: number; // Connection timeout is in seconds. Must be between 1 and 30
  idleTimeout?: number; // Idle timeout is in seconds
  poolSize?: number; // Pool size is the number of connections to keep open. Min 1
  tls?: {
    enabled: boolean; // Enable TLS
    certificates?: string[]; // Array of paths to certificate files
    verify?: boolean; // Verify server certificate
  };
};
