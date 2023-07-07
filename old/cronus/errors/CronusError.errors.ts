export class CronusError extends Error {
  protected static _module = 'cronus';
  protected _jobName: string;
  protected _schedule: string;

  constructor(message: string, jobName = '-', schedule = '-') {
    super(CronusError._makeMessage(message, jobName, schedule));
    this._jobName = jobName;
    this._schedule = schedule;
    Object.setPrototypeOf(this, CronusError.prototype);
  }

  get job(): string {
    return this._jobName;
  }

  get schedule(): string {
    return this._schedule;
  }

  protected static _makeMessage(
    message: string,
    jobName: string,
    schedule: string,
  ): string {
    return `[module='${CronusError._module}' job='${jobName}' schedule='${schedule}'] ${message}`;
  }
}
