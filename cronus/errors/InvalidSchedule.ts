import { CronusBaseError } from './BaseError.ts';

export class CronusInvalidSchedule extends CronusBaseError {
  constructor(job: string, schedule: string) {
    super(`Not a valid cron syntax`, { job, schedule });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
