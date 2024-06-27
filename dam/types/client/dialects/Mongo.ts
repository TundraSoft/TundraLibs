import type { ClientOptions } from '../Options.ts';

export type MongoOptions = ClientOptions & {
  dialect: 'MONGO';
  host: string;
  port?: number;
  username?: string;
  password?: string;
  authMechanism?: 'SCRAM-SHA-1' | 'SCRAM-SHA-256' | 'MONGODB-X509';
  authDb?: string;
  database: string;
  // connectionTimeout?: number; // Connection timeout is in seconds. Must be between 1 and 30
  // idleTimeout?: number; // Idle timeout is in seconds
  // poolSize?: number; // Pool size is the number of connections to keep in the pool
  tls?: {
    enabled: boolean;
    certificate: string;
    key: string;
  };
};
