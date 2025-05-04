import type {
  EngineOptions,
  EngineServerOptions,
  EngineTLSOptions,
} from '../../../types/mod.ts';

export type PostgresEngineOptions =
  & EngineOptions
  & EngineServerOptions
  & EngineTLSOptions
  & {
    engine: 'POSTGRES';
    poolSize: number;
    idleTimeout: number; // in seconds
  };
