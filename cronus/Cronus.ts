import { Events } from '../events/mod.ts';

import type { CronusEvents, CronusFields, CronusJob } from './types/mod.ts';
import { CronusError } from './errors/mod.ts';
import { DAY_NAMES, MONTH_NAMES } from './const/mod.ts';

export class Cronus extends Events<CronusEvents> {
  protected _schedules: Map<string, string[]> = new Map();
  protected _jobs: Map<string, CronusJob> = new Map();
  protected _runner: number | undefined = undefined;
  protected _initializer: number | undefined = undefined;

  //#region Public Methods

  //#region Job management
  /**
   * Check if a job with the given name exists
   *
   * @param {string} name - The name of the job to check for
   * @return {boolean} - Returns true if the job exists, false otherwise
   * @public
   */
  public hasJob(name: string): boolean {
    name = this._cleanJobName(name);
    return this._jobs.has(name);
  }

  /**
   * Find and return a job with the given name from the collection
   *
   * @param {string} name - The name of the job to find
   * @returns {CronusJob} - Returns the CronusJob object if found
   * @throws Will throw an error if the job with the specified name is not found
   * @public
   */
  public getJob(name: string): CronusJob {
    if (this.hasJob(name)) {
      return this._jobs.get(this._cleanJobName(name)) as CronusJob;
    }
    throw new CronusError(`Could not find job with the name ${name}`, name);
  }

  /**
   * Add a new job to the collection with the specified name and job details
   *
   * @param {string} name - The name of the job to add
   * @param {CronusJob} jobDetails - An object containing details about the job
   * @returns {Cronus} Returns the current Cronus instance
   * @throws Will throw an error if the job with the specified name already exists or the cron schedule is invalid
   * @public
   */
  public addJob(name: string, jobDetails: CronusJob): Cronus {
    name = this._cleanJobName(name);
    if (this.hasJob(name)) {
      throw new CronusError(
        `There is already a job with the same name ${name}`,
        name,
      );
    }
    jobDetails.schedule = Cronus._cleanSchedule(jobDetails.schedule);
    // Validate Schedule
    if (Cronus.validateSchedule(jobDetails.schedule) === false) {
      throw new CronusError(
        `Invalid cron schedule provided`,
        name,
        jobDetails.schedule,
      );
    }
    if (!(jobDetails.action instanceof Function)) {
      throw new CronusError(
        `Expected action to be a callback function`,
        name,
        jobDetails.schedule,
      );
    }
    // Add to jobs map
    this._jobs.set(name, jobDetails);

    // Add to schedule
    if (jobDetails.enable !== false) {
      const schedules = this._schedules.get(jobDetails.schedule) || [];
      schedules.push(name);
      this._schedules.set(jobDetails.schedule, schedules);
    }

    return this;
  }

  /**
   * Removes a cron job from the scheduler
   *
   * @param {string} name - The name of the job to remove
   * @returns {Cronus} - Returns the Cronus instance
   * @public
   */
  public removeJob(name: string): Cronus {
    name = this._cleanJobName(name);
    if (this.hasJob(name)) {
      // Remove from schedule first
      const jobDetails = this.getJob(name),
        schedule: string[] = this._schedules.get(jobDetails.schedule) || [],
        updatedSchedule = schedule.filter((x) => x !== name);
      this._schedules.set(jobDetails.schedule, updatedSchedule);
      this._jobs.delete(name);
    }
    return this;
  }

  /**
   * Updates a Cronus job with the given name and job details.
   *
   * @param {string} name - The name of the job to update.
   * @param {CronusJob} jobDetails - The updated details for the job.
   * @returns {Cronus} - The Cronus instance after updating the job.
   * @public
   */
  public updateJob(name: string, jobDetails: CronusJob): Cronus {
    this.removeJob(name);
    return this.addJob(name, jobDetails);
  }

  /**
   * Enables a Cronus job with the given name.
   *
   * @param {string} name - The name of the job to enable.
   * @returns {Cronus} - The Cronus instance after enabling the job.
   * @public
   */
  public enableJob(name: string): Cronus {
    const jobDetails = this.getJob(name);
    return this.updateJob(name, { ...jobDetails, ...{ enable: true } });
  }

  /**
   * Disables a Cronus job with the given name.
   *
   * @param {string} name - The name of the job to disable.
   * @returns {Cronus} - The Cronus instance after disabling the job.
   * @public
   */
  public disableJob(name: string): Cronus {
    const jobDetails = this.getJob(name);
    return this.updateJob(name, { ...jobDetails, ...{ enable: false } });
  }

  /**
   * Returns an array of job names for a given schedule.
   *
   * @param {string} schedule - The cron schedule to get jobs for.
   * @returns {string[]} An array of job names for the given schedule.
   * @public
   */
  public getScheduledJobs(schedule: string): string[] {
    schedule = Cronus._cleanSchedule(schedule);
    return this._schedules.get(schedule) || [];
  }
  //#endregion Job Management

  /**
   * Starts the Cronus scheduler. Runs active jobs every minute,
   * starting from the next full minute.
   *
   * @returns {void}
   * @public
   */
  public start(): void {
    this.stop();
    const now = new Date();
    // Calculate initial delay until the start of the next minute
    const delay = (60 - now.getSeconds()) * 1000;
    this._initializer = setTimeout(() => {
      this._initializer = undefined;
      // Run immediately
      this._runJobs();
      // Schedule subsequent runs every minute
      this._runner = setInterval(() => this._runJobs(), 60_000);
    }, delay);
  }

  /**
   * Stops the job scheduler if running
   *
   * @returns {void}
   * @public
   */
  public stop(): void {
    if (this._initializer) {
      clearTimeout(this._initializer);
      this._initializer = undefined;
    }
    if (this._runner) {
      clearInterval(this._runner);
      this._runner = undefined;
    }
  }

  /**
   * Checks whether a given cron expression can run at the current date and time.
   *
   * @param {string} cronExpression - The cron expression to check.
   * @returns {boolean} - Whether the expression can run at this moment.
   * @public
   * @static
   */
  public static canRun(cronExpression: string): boolean {
    const parts = cronExpression.split(' '),
      currentDate = new Date();

    // Check if the current minute matches the cron's minute field (or if it is '*')
    if (
      parts[0] !== '*' &&
      !this._checkField(parts[0], 'MINUTE', currentDate.getMinutes())
    ) {
      return false;
    }

    // Check if the current hour matches the cron's hour field (or if it is '*')
    if (
      parts[1] !== '*' &&
      !this._checkField(parts[1], 'HOUR', currentDate.getHours())
    ) {
      return false;
    }

    // Check if the current day of the month matches the cron's day of month field (or if it is '*')
    if (
      parts[2] !== '*' &&
      !this._checkField(parts[2], 'DATE', currentDate.getDate())
    ) {
      return false;
    }

    // Check if the current month matches the cron's month field (or if it is '*')
    if (
      parts[3] !== '*' &&
      !this._checkField(parts[3], 'MONTH', currentDate.getMonth())
    ) {
      return false;
    }

    // Check if the current day of the week matches the cron's day of week field (or if it is '*')
    if (
      parts[4] !== '*' &&
      !this._checkField(parts[4], 'DAY', currentDate.getDay())
    ) {
      return false;
    }

    // The expression should run at this moment
    return true;
  }

  /**
   * Validates a cron schedule syntax. Returns true if the schedule is valid, false otherwise.
   *
   * @param {string} schedule - The cron schedule to validate.
   * @returns {boolean} - Whether the schedule has a valid syntax.
   * @public
   * @static
   */
  public static validateSchedule(schedule: string): boolean {
    const scheduleParts = Cronus._cleanSchedule(schedule).trim().split(/\s+/);

    if (scheduleParts.length !== 5) {
      return false; // Invalid number of schedule parts
    }

    //#region Validate each item
    if (Cronus._checkField(scheduleParts[0], 'MINUTE') === false) {
      return false;
    }
    if (Cronus._checkField(scheduleParts[1], 'HOUR') === false) {
      return false;
    }
    if (Cronus._checkField(scheduleParts[2], 'DATE') === false) {
      return false;
    }
    if (Cronus._checkField(scheduleParts[3], 'MONTH') === false) {
      return false;
    }
    if (Cronus._checkField(scheduleParts[4], 'DAY') === false) {
      return false;
    }
    //#endregion Validate each item
    return true;
  }

  //#endregion Public Methods
  //#region Protected Methods
  /**
   * Cleans up a job name by trimming whitespace and converting to lowercase.
   *
   * @param {string} name - The job name to clean.
   * @returns {string} - The cleaned-up job name.
   * @protected
   */
  protected _cleanJobName(name: string): string {
    return name.trim().toLowerCase();
  }

  /**
   * Cleans the cron schedule ensuring that there are no extra space, removes
   * string (Month names and day names)
   *
   * @param {string} schedule - The schedule.
   * @returns {string} - The cleaned-up schedule.
   * @protected
   * @static
   */
  protected static _cleanSchedule(schedule: string): string {
    schedule = schedule.trim().toUpperCase();
    Object.entries(MONTH_NAMES).map(([name, no]) => {
      schedule = schedule.replaceAll(name, no.toString());
    });

    Object.entries(DAY_NAMES).map(([day, no]) => {
      schedule = schedule.replaceAll(day, no.toString());
    });

    return schedule;
  }

  /**
   * Checks if a given field value is valid for a given cron type.
   *
   * @param {string} fieldValue - The value of the field to check.
   * @param {CronusFields} type - The type of cron field being checked.
   * @param {number} [currVal] - The current value of the field (optional).
   * @returns {boolean} Returns true if the field value is valid, false otherwise.
   * @protected
   * @static
   */
  protected static _checkField(
    fieldValue: string,
    type: CronusFields,
    currVal?: number,
  ): boolean {
    if (fieldValue === '*') {
      return true;
    }
    let start: number,
      end: number;
    switch (type) {
      case 'MINUTE':
        start = 0;
        end = 59;
        break;
      case 'HOUR':
        start = 0;
        end = 23;
        break;
      case 'DATE':
        start = 1;
        end = 31;
        break;
      case 'MONTH':
        start = 1;
        end = 12;
        break;
      case 'DAY':
        start = 0;
        end = 6;
        break;
      default:
        // Unknown, should never come here but we leave it
        return false;
    }
    // Ok we have the ranges, now we check if the value is valid
    const values = fieldValue.split(',');
    for (const value of values) {
      if (value.includes('/')) {
        // Its a step function, i.e */5 = every 5
        const [range, step] = value.split('/');
        // // First char must be *
        // if (range !== '*') {
        //   return false;
        // }
        // // If currval is present then the output should be 0 to run
        // if (currVal && currVal % parseInt(step) !== 0) {
        //   return false;
        // }
        // // Ok this is for validation
        // if (!Cronus._checkRange(step, start, end)) {
        //   return false;
        // }

        if (range.includes('-')) {
          // It's a range with a step, i.e 2-20/2
          const [from, to] = range.split('-');
          // If currVal is present, it must be within the range specified
          if (
            currVal &&
            !Cronus._checkRange(
              currVal.toString(),
              parseInt(from),
              parseInt(to),
            )
          ) {
            return false;
          }
          // Ok this is for validation
          if (
            !Cronus._checkRange(from, start, end) ||
            !Cronus._checkRange(to, start, end)
          ) {
            return false;
          }
          // Check step value
          if (parseInt(step) < 1) {
            return false;
          }
        } else {
          // It's a wildcard with a step, i.e */15
          // First char must be *
          if (range !== '*') {
            return false;
          }
          // If currval is present then the output should be 0 to run
          if (currVal && currVal % parseInt(step) !== 0) {
            return false;
          }
          // Ok this is for validation
          if (!Cronus._checkRange(step, start, end)) {
            return false;
          }
        }
      } else if (value.includes('-')) {
        // Its a range function
        const [from, to] = value.split('-');
        // If currVal is present, it must be within the range specified
        if (
          currVal &&
          !Cronus._checkRange(currVal.toString(), parseInt(from), parseInt(to))
        ) {
          return false;
        }
        // Ok this is for validation
        if (
          !Cronus._checkRange(from, start, end) ||
          !Cronus._checkRange(to, start, end)
        ) {
          return false;
        }
      } else {
        // Its a direct value
        if (currVal && !Cronus._checkRange(value, currVal, currVal)) {
          return false;
        }
        // Ok its for validation
        if (!Cronus._checkRange(value, start, end)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Checks if a given value is a valid range for a cron expression.
   * @param {string} value - The value to check.
   * @param {number} from - The minimum allowed value for the range.
   * @param {number} to - The maximum allowed value for the range.
   * @returns {boolean}`true` if the value is a valid range, `false` otherwise.
   * @protected
   * @static
   */
  protected static _checkRange(
    value: string,
    from: number,
    to: number,
  ): boolean {
    if (value.trim() === '*') {
      return true;
    }
    const val = parseInt(value);
    return !isNaN(val) && val >= from && val <= to;
  }

  /**
   * Runs all jobs whose schedules match the current time.
   *
   * @returns {void}
   * @protected
   */
  protected _runJobs(): void {
    const now = new Date();
    this._schedules.forEach((jobNames: string[], schedule: string) => {
      // Check if the schedule match
      if (Cronus.canRun(schedule) === true) {
        // Yes we need to run it
        Promise.allSettled(jobNames.map(async (name) => {
          const id = crypto.randomUUID(),
            start = new Date(),
            stTime = performance.now();
          let error: Error | undefined = undefined,
            output: unknown;
          // Call start event
          this.emit('start', id, name, start);
          try {
            const job = this._jobs.get(name) as CronusJob;
            output = await job.action.apply(null, job.arguments || []);
          } catch (e) {
            // Call error
            error = e;
          } finally {
            const timeTaken = (performance.now() - stTime) / 1000;
            if (error !== undefined) {
              // Call error event
              this.emit('error', id, name, timeTaken, error);
            } else {
              // Call success event
              this.emit('finish', id, name, timeTaken, output);
            }
            // Call run event
            this.emit('run', id, name, start, timeTaken, output, error);
          }
        }));
      }
    });
  }
  //#endregion Protected Methods
}

// console.log(Cronus.validateCronSchedule('* * * * *'));
// console.log(Cronus.validateCronSchedule('*/5 */10 */20 */2 1-3'))

// const a = new Cronus();
// a.addJob('Test Every Minute', {
//   schedule: '* * * * *',
//   action: (a?: string) => { console.log(`Minute job ran at ${new Date().toISOString()} -- ${a}`) },
//   arguments: ['sdasdfasdf']
// });

// a.addJob('Test Every Minute 2', {
//   schedule: '* * * * *',
//   action: (a?: number) => { console.log(`Minute job ran at ${new Date().toISOString()} -- ${a}`) },
// });

// a.addJob('Test 5 Minute', {
//   schedule: '*/5 * * * *',
//   action: () => console.log(`5 Minute job ran at ${new Date().toISOString()}`)
// });

// a.addJob('Test Fri 22 45 Minute', {
//   schedule: '36 3 * * sat',
//   action: () => { console.log(`Friday 22 45 job ran at ${new Date().toISOString()}`) }
// });

// a.start();
