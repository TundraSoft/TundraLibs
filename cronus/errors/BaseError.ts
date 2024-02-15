import { TundraLibError } from '../../utils/TundraLibError.ts';
// import type { TundraLibErrorMetaTags } from '../../utils/mod.ts';

export class CronusBaseError extends TundraLibError {
  public readonly library = 'Cronus';

  constructor(message: string, meta?: Record<string, unknown>, cause?: Error) {
    super(message, meta, cause);
  }

  get job(): string | undefined {
    if (this.meta) {
      if (this.meta.job) {
        return this.meta.job as string;
      }
    }
    return undefined;
  }

  get schedule(): string | undefined {
    if (this.meta) {
      if (this.meta.schedule) {
        return this.meta.schedule as string;
      }
    }
    return undefined;
  }
}
