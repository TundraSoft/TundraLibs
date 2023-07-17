import { BaseError } from '../../common/BaseError.ts';
import type { ErrorMetaTags } from '../../common/BaseError.ts';

export class CronusBaseError extends BaseError {
  constructor(message: string, metaTags?: ErrorMetaTags) {
    super(message, 'cronus', metaTags);
    Object.setPrototypeOf(this, CronusBaseError.prototype);
  }

  get job(): string | undefined {
    if (this._metaTags) {
      if (this._metaTags.job) {
        return this._metaTags.job as string;
      }
    }
    return undefined;
  }

  get schedule(): string | undefined {
    if (this._metaTags) {
      if (this._metaTags.schedule) {
        return this._metaTags.schedule as string;
      }
    }
    return undefined;
  }
}

export class CronusJobNotFound extends CronusBaseError {
  constructor(job: string) {
    super(`Could not find the job specified`, { job });
    Object.setPrototypeOf(this, CronusJobNotFound.prototype);
  }
}

export class CronusJobAlreadyExists extends CronusBaseError {
  constructor(job: string) {
    super(`A job with the same name already exists`, { job });
    Object.setPrototypeOf(this, CronusJobAlreadyExists.prototype);
  }
}

export class CronusJobInvalidCallback extends CronusBaseError {
  constructor(job: string, schedule: string) {
    super(`Callback expected to be a function`, { job: job, schedule });
    Object.setPrototypeOf(this, CronusJobInvalidCallback.prototype);
  }
}

export class CronusJobInvalidSchedule extends CronusBaseError {
  constructor(job: string, schedule: string) {
    super(`Not a valid cron syntax`, { job, schedule });
    Object.setPrototypeOf(this, CronusJobInvalidSchedule.prototype);
  }
}
