import { Dialects } from './Dialects.ts';

export type ClientConfig = {
  dialect: Dialects;
  longQueryWarningTime?: number; // in seconds
};

export type SQLiteConfig = ClientConfig & {
  dbPath: string;
  memory?: boolean;
  mode?: 'read' | 'write' | 'create';
};

type BasicConnection = {
  host: string;
  port?: number;
  userName: string;
  password: string;
  database: string;
} & ClientConfig;

type TLSConfig = {
  enforce: boolean;
  enabled: boolean;
  ca: string[];
};

export type PostgresConfig = BasicConnection & {
  poolSize?: number;
  idleTimeout?: number;
  connectionTimeout?: number;
  tls?: Partial<TLSConfig>;
};

export type MariaConfig = BasicConnection & {
  poolSize?: number;
  idleTimeout?: number;
  connectionTimeout?: number;
};

export type MongoDBConfig = BasicConnection & {
  authMechanism?: 'SCRAM-SHA-1' | 'SCRAM-SHA-256' | 'MONGODB-X509';
};
