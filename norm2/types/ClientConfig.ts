import { Dialects } from "./Dialects.ts";

export type ClientConfig = {
  name: string;
  dialect: Dialects;
};

type SSL = 'require' | 'allow' | 'prefer' | 'verify-full' | boolean | object;

type TLSConfig = {
  enabled: boolean;
}

type BasicConnection = {
  host: string;
  port?: number;
  userName: string;
  password: string;
  database: string;
};

export type PostgresConfig = ClientConfig & BasicConnection & {
  poolSize?: number;
  idleTimeout?: number;
  connectionTimeout?: number;

};

export type MySQLConfig = ClientConfig & BasicConnection & {
  poolSize?: number;
  idleTimeout?: number;
  connectionTimeout?: number;
};

export type SQLiteConfig = ClientConfig & BasicConnection & {
  
};

export type MongoConfig = ClientConfig & BasicConnection & {
  authMechanism?: "SCRAM-SHA-1" | "SCRAM-SHA-256" | "MONGODB-X509";
  
};
