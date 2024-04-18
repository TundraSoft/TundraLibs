import { CacherBaseError } from './Base.ts';

export class CacherConfigError extends CacherBaseError {
  constructor(
    meta: {
      engine: 'MEMORY' | 'REDIS';
      config: string;
      key: string;
      value?: string;
    },
    cause?: Error,
  ) {
    super(
      'Invalid configuration value passed for ${key} - ${value} in ${config}',
      meta,
      cause,
    );
  }
}
