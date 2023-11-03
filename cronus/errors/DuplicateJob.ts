import { CronusBaseError } from './BaseError.ts';

export class CronusDuplicateJob extends CronusBaseError {
  constructor(job: string) {
    super(`A job with the same name already exists`, { job });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
