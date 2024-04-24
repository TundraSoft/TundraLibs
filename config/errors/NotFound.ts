import { ConfigError } from './Base.ts';

export class ConfigNotFound extends ConfigError {
  constructor(meta: { config?: string; path: string }, cause?: Error) {
    super(
      meta.config === undefined
        ? 'Could not find directory ${path} / ${path} is not a directory'
        : 'Config not find config ${config} in ${path}',
      { config: meta.config || 'N/A', path: meta.path },
      cause,
    );
  }
}
