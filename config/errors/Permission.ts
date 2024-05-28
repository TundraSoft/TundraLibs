import { ConfigError } from './Base.ts';

export class ConfigPermissionError extends ConfigError {
  constructor(meta: { path: string }, cause?: Error) {
    super('Read permission is required for path ${path}', {
      config: 'N/A',
      path: meta.path,
    }, cause);
  }
}
