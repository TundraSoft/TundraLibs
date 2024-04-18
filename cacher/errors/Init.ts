import { CacherBaseError } from './Base.ts';

export class CacherInitError extends CacherBaseError {
  constructor(
    meta: { engine: 'MEMORY' | 'REDIS'; config: string },
    cause?: Error,
  ) {
    super('Unable to initialize caching engine', meta, cause);
  }
}
