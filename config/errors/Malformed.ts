import { ConfigError } from './Base.ts';

export class MalformedConfig extends ConfigError {
  constructor(
    meta: { config: string; fileName: string; path: string; extension: string },
    cause?: Error,
  ) {
    super(
      'Unable to parse config file ${fileName} in path ${path}',
      meta,
      cause,
    );
  }
}
