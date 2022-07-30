import { Dialect } from "./Dialect.ts";

export type ClientConfig = {
  dialect: Dialect;
};

export type SQLiteConfig = ClientConfig & {
  dbPath: string;
  memory?: boolean;
  mode?: "read" | "write" | "create";
};

type StandardDBConfig = ClientConfig & {
  host: string;
  database: string;
  port: number;
  user: string;
  password: string;
  poolSize: number;
};

type TLSConfig = {
  enforce: boolean;
  enabled: boolean;
  ca: string[];
};

export type PostgresConfig = StandardDBConfig & {
  tls: Partial<TLSConfig>;
};
