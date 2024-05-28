import { ConfigError } from './Base.ts';

export class ConfigNotDefined extends ConfigError {
  constructor(meta: { config: string }, cause?: Error) {
    super('Config ${config} not loaded/defined', meta, cause);
  }
}
