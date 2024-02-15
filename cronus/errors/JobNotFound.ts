import { CronusBaseError } from './BaseError.ts';

export class CronusJobNotFound extends CronusBaseError {
  constructor(job: string) {
    super(`Could not find the job specified`, { job });
  }
}
