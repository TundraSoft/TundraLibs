import type {
  EngineOptions,
  EngineServerOptions,
  EngineTLSOptions,
} from '../../../types/mod.ts';

export type MariaEngineOptions =
  & EngineOptions
  & EngineServerOptions
  & EngineTLSOptions
  & {
    dialect: 'MARIA';
    connectionTimeout?: number;
    poolSize?: number;
    idleTimeout?: number;
  };
