import { CronusBaseError } from './BaseError.ts';

export class CronusDuplicateJob extends CronusBaseError {
  constructor(job: string) {
    super('A job with the name ${job} already exists', { job });
  }
}
