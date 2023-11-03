import { CronusBaseError } from './BaseError.ts';

export class CronusInvalidCallback extends CronusBaseError {
  constructor(job: string, schedule: string) {
    super(`Callback expected to be a function`, { job: job, schedule });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
