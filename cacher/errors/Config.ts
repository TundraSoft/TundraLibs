import { CacherBaseError } from './Base.ts';

export class CacherConfigError extends CacherBaseError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, meta);
  }
}
