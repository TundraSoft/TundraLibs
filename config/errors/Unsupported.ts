import { ConfigError } from './Base.ts';

export class UnsupportedConfig extends ConfigError {
  constructor(
    meta: { config: string; path: string; ext: string },
    cause?: Error,
  ) {
    super('Unsupported extension ${ext}.', meta, cause);
  }
}
