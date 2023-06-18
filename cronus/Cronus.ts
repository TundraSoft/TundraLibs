import { Events } from '../events/mod.ts';

import type { CronusEvents, CronusJob } from './types/mod.ts';
import { CronusError } from './errors/mod.ts';

export class Cronus extends Events<CronusEvents> {
  protected _schedules: Map<string, string[]> = new Map();
  protected _jobs: Map<string, CronusJob> = new Map();

  //#region Public Methods

  //#region Job management
  /**
   * Check if a job with the given name exists
   * @param {string} name - The name of the job to check for
   * @return {boolean} - Returns true if the job exists, false otherwise
   * @public
   */
  public has(name: string): boolean {
    name = this._cleanJobName(name);
    return this._jobs.has(name);
  }

  /**
   * Find and return a job with the given name from the collection
   * @param {string} name - The name of the job to find
   * @returns {CronusJob} - Returns the CronusJob object if found
   * @throws Will throw an error if the job with the specified name is not found
   * @public
   */
  public get(name: string): CronusJob {
    if (this.has(name)) {
      return this._jobs.get(this._cleanJobName(name)) as CronusJob;
    }
    throw new CronusError(`Could not find job with the name ${name}`, name);
  }

  /**
   * Add a new job to the collection with the specified name and job details
   * @param {string} name - The name of the job to add
   * @param {CronusJob} jobDetails - An object containing details about the job
   * @returns {Cronus} Returns the current Cronus instance
   * @throws Will throw an error if the job with the specified name already exists or the cron schedule is invalid
   * @public
   */
  public add(name: string, jobDetails: CronusJob): Cronus {
    name = this._cleanJobName(name);
    if (this.has(name)) {
      throw new CronusError(
        `There is already a job with the same name ${name}`,
        name,
      );
    }
    // Validate Schedule
    if (Cronus.validateSchedule(jobDetails.schedule) === false) {
      throw new CronusError(
        `Invalid cron schedule provided`,
        name,
        jobDetails.schedule,
      );
    }
    if (jobDetails.action! instanceof Function) {
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
   * @param {string} name - The name of the job to remove
   * @returns {Cronus} - Returns the Cronus instance
   * @public
   */
  public remove(name: string): Cronus {
    name = this._cleanJobName(name);
    if (this.has(name)) {
      // Remove from schedule first
      const jobDetails = this.get(name),
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
  public update(name: string, jobDetails: CronusJob): Cronus {
    this.remove(name);
    return this.add(name, jobDetails);
  }

  /**
   * Enables a Cronus job with the given name.
   *
   * @param {string} name - The name of the job to enable.
   * @returns {Cronus} - The Cronus instance after enabling the job.
   * @public
   */
  public enable(name: string): Cronus {
    const jobDetails = this.get(name);
    return this.update(name, { ...jobDetails, ...{ enable: true } });
  }

  /**
   * Disables a Cronus job with the given name.
   *
   * @param {string} name - The name of the job to disable.
   * @returns {Cronus} - The Cronus instance after disabling the job.
   * @public
   */
  public disable(name: string): Cronus {
    const jobDetails = this.get(name);
    return this.update(name, { ...jobDetails, ...{ enable: false } });
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
    const now = new Date();
    // Calculate initial delay until the start of the next minute
    const delay = (60 - now.getSeconds()) * 1000;
    setTimeout(() => {
      // Run immediately
      this._runJobs();
      // Schedule subsequent runs every minute
      setInterval(() => this._runJobs(), 60_000);
    }, delay);
  }

  /**
   * Checks whether a given cron expression can run at the current date and time.
   *
   * @param {string} cronExpression - The cron expression to check.
   * @returns {boolean} - Whether the expression can run at this moment.
   * @static
   * @public
   */
  public static canRun(cronExpression: string): boolean {
    const parts = cronExpression.split(' '),
      currentDate = new Date();

    // Check if the current minute matches the cron's minute field (or if it is '*')
    if (
      parts[0] !== '*' && !this._checkField(parts[0], currentDate.getMinutes())
    ) {
      return false;
    }

    // Check if the current hour matches the cron's hour field (or if it is '*')
    if (
      parts[1] !== '*' && !this._checkField(parts[1], currentDate.getHours())
    ) {
      return false;
    }

    // Check if the current day of the month matches the cron's day of month field (or if it is '*')
    if (
      parts[2] !== '*' && !this._checkField(parts[2], currentDate.getDate())
    ) {
      return false;
    }

    // Check if the current month matches the cron's month field (or if it is '*')
    if (
      parts[3] !== '*' && !this._checkMonth(parts[3], currentDate.getMonth())
    ) {
      return false;
    }

    // Check if the current day of the week matches the cron's day of week field (or if it is '*')
    if (
      parts[4] !== '*' && !this._checkDayOfWeek(parts[4], currentDate.getDay())
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
   */
  public static validateSchedule(schedule: string): boolean {
    // Can contain max of 5 entries
    const cronSyntax =
      /^(\*|(?:\*|(?:[0-9]|(?:[1-5][0-9])))\/(?:[0-9]|(?:[1-5][0-9]))|(?:[0-9]|(?:[1-5][0-9]))(?:(?:\-[0-9]|\-(?:[1-5][0-9]))?|(?:\,(?:[0-9]|(?:[1-5][0-9])))*)) (\*|(?:\*|(?:\*|(?:[0-9]|1[0-9]|2[0-3])))\/(?:[0-9]|1[0-9]|2[0-3])|(?:[0-9]|1[0-9]|2[0-3])(?:(?:\-(?:[0-9]|1[0-9]|2[0-3]))?|(?:\,(?:[0-9]|1[0-9]|2[0-3]))*)) (\*|\?|L(?:W|\-(?:[1-9]|(?:[12][0-9])|3[01]))?|(?:[1-9]|(?:[12][0-9])|3[01])(?:W|\/(?:[1-9]|(?:[12][0-9])|3[01]))?|(?:[1-9]|(?:[12][0-9])|3[01])(?:(?:\-(?:[1-9]|(?:[12][0-9])|3[01]))?|(?:\,(?:[1-9]|(?:[12][0-9])|3[01]))*)) (\*|(?:[1-9]|1[012]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:(?:\-(?:[1-9]|1[012]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC))?|(?:\,(?:[1-9]|1[012]|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC))*)) (\*|\?|[0-6](?:L|\#[1-5])?|(?:[0-6]|SUN|MON|TUE|WED|THU|FRI|SAT)(?:(?:\-(?:[0-6]|SUN|MON|TUE|WED|THU|FRI|SAT))?|(?:\,(?:[0-6]|SUN|MON|TUE|WED|THU|FRI|SAT))*))$/i;
    return cronSyntax.test(schedule);
  }

  //#endregion Public Methods
  //#region Protected Methods
  /**
   * Cleans up a job name by trimming whitespace and converting to lowercase.
   *
   * @param {string} name - The job name to clean.
   * @returns {string} - The cleaned-up job name.
   */
  protected _cleanJobName(name: string): string {
    return name.trim().toLowerCase();
  }

  /**
   * Runs all jobs whose schedules match the current time.
   *
   * @returns {void}
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
            output = await this._jobs.get(name)?.action();
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

  /**
   * Checks whether a given field of a cron expression matches the current value.
   *
   * @param {string} field - The cron field to check.
   * @param {number} currentValue - The current value of the field to compare against.
   * @returns {boolean} - Whether the field matches the current value.
   */
  protected static _checkField(field: string, currentValue: number): boolean {
    // Check if the field is a range
    if (field.includes('-')) {
      const [min, max] = field.split('-');
      return currentValue >= parseInt(min) && currentValue <= parseInt(max);
    }

    // Check if the field is a list
    if (field.includes(',')) {
      const values = field.split(',');
      return values.some((value) => parseInt(value) === currentValue);
    }

    // Check if the field is an increment
    if (field.includes('/')) {
      const [value, increment] = field.split('/');
      return (currentValue - (parseInt(value) | 0)) % parseInt(increment) === 0;
    }

    // Check if the field is a wildcard
    return field === '*';
  }

  /**
   * Checks if a given month matches the current month.
   *
   * @param {string} month The month to check. This can be a three-letter abbreviation (e.g. "jan") or a wildcard (e.g. "*").
   * @param {number} currentMonth The current month as a number (January is 1, February is 2, etc.).
   * @returns {boolean} `true` if the given month matches the current month, `false` otherwise.
   * @protected
   */
  protected static _checkMonth(month: string, currentMonth: number): boolean {
    const monthNames = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];
    const index = monthNames.indexOf(month.toLowerCase());

    // Check if the field is a named month
    if (index >= 0) {
      return currentMonth === index;
    }

    // Check if the field is a wildcard or a number
    return this._checkField(month, currentMonth + 1);
  }

  /**
   * Checks if a given day of week matches the current day.
   *
   * @param {string} day The day to check. This can be a three-letter abbreviation (e.g. "mon") or a wildcard (e.g. "*").
   * @param {number} currentDay The current day as a number (Sunday is 0, Monday is 1, etc.).
   * @returns {boolean} `true` if the given day matches the current day, `false` otherwise.
   * @protected
   */
  protected static _checkDayOfWeek(day: string, currentDay: number): boolean {
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const index = dayNames.indexOf(day.toLowerCase());

    // Check if the field is a named day of week
    if (index >= 0) {
      return currentDay === index;
    }

    // Check if the field is a wildcard or a number
    return this._checkField(day, currentDay);
  }

  //#endregion Protected Methods
}
