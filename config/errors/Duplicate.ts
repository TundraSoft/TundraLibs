import { ConfigError } from './Base.ts';

export class DuplicateConfig extends ConfigError {
  constructor(meta: { config: string; path?: string }, cause?: Error) {
    super(
      `${
        meta.path === undefined
          ? 'Config under the name ${config} already loaded'
          : 'Multiple config files found for ${config} in ${path}'
      }`,
      meta,
      cause,
    );
  }
}
