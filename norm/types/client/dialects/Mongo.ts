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
  tls?: {
    enabled: boolean;
    certificate?: string;
    key: string;
  };
};
