import { CacherBaseError } from './Base.ts';

export class CacherDuplicateError extends CacherBaseError {
  constructor(
    meta: { engine: 'MEMORY' | 'REDIS'; config: string },
    cause?: Error,
  ) {
    super('There already exists a Cacher with the name ${config}', meta, cause);
  }
}
