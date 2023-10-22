import type { Dialects } from './Dialects.ts';

export type ClientOptions = {
  dialect: Dialects;
  longQuery?: number; // in seconds
  encryptionKey?: string;
};

type TLSConfig = {
  enforce: boolean;
  enabled: boolean;
  ca: string[];
};

export type PostgresClientOptions = ClientOptions & {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  poolSize?: number;
  tls?: Partial<TLSConfig>;
};
