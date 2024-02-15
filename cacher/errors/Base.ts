import { TundraLibError } from '../../utils/TundraLibError.ts';

export class CacherBaseError extends TundraLibError {
  public readonly library = 'Cacher';

  constructor(message: string, meta?: Record<string, unknown>, cause?: Error) {
    super(message, meta, cause);
  }
}
