import { CacherBaseError } from './Base.ts';

export class CacherConnectionError extends CacherBaseError {
  constructor(message: string, meta?: Record<string, unknown>, cause?: Error) {
    super(message, meta, cause);
  }
}
