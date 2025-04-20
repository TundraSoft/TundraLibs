import { type Engine } from '../Engines.ts';

export type EngineOptions = {
  // Number of seconds after which a query is considered slow
  slowQueryThreshold?: number;

  // Max number of connection attempts before status becomes UNABLE
  maxConnectAttempts?: number;

  // The engine type
  engine: Engine;

  // Maximum number of concurrent queries
  maxConcurrent?: number;
};

export type EngineServerOptions = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

export type EngineTLSOptions = {
  CACertPath?: string;
  enforceTLS?: boolean;
};
