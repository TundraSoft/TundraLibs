# Cronus

A simple Cron implementation which is capable of running both synchronus and
asynchronus functions at pre-determined schedule.

## Limitations

### Supported Schedule

Currently supports only upto minute scheduling, i.e run every minute. There is
no plan to allow support for seconds or years

| Field  | Allowed Values | Allowed Values     |
| ------ | -------------- | ------------------ |
| Minute | 0-59           | * / , -            |
| Hour   | 0-23           | * / , -            |
| Date   | 1-31           | * / , -            |
| Month  | 1-12           | * / , - JAN,FEB... |
| Day    | 0-6            | * / , - SUN,MON... |

### Race condition

Currently if a job has started executing and takes a long time to execute
example 10 minutes, and this job is scheduled to run every 5 minutes, then
cronus will start the second execution of the job after 5 minutes. This
could lead to race condition in the `action` function if it is not handled.

## Usage

```ts
import { Cronus } from 'https://raw.githubusercontent.com/TundraSoft/TundraLibs/main/cronus/mod.ts';

const a = new Cronus();

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// #region Define monitoring events
// Capture all job execution
a.on('start', (id: string, name: string, start: Date) => {
  console.log(
    `[cronus type='start'] running job ${name} with job id: ${id} at ${start}`,
  );
});

// Capture errors (of the callback)
a.on(
  'error',
  (id: string, name: string, start: Date, timeTaken: number, error: Error) => {
    console.log(
      `[cronus type='error'] error with ${name} with job id: ${id} at ${start}, ran for ${timeTaken}s . Error Message: ${error.message}`,
    );
  },
);

// Capture only finished executions (successful)
a.on(
  'finish',
  (
    id: string,
    name: string,
    start: Date,
    timeTaken: number,
    output?: any[],
  ) => {
    console.log(
      `[cronus type='finish'] Ran ${name} with job id: ${id} at ${start}, ran for ${timeTaken}s ${
        (output !== undefined)
          ? ` with output: ${JSON.stringify(output)}.`
          : '.'
      }`,
    );
  },
);

// Or capture them all with one event
a.on(
  'run',
  (
    id: string,
    name: string,
    start: Date,
    timeTaken: number,
    output?: any,
    error?: Error,
  ) => {
    console.log(
      `[cronus type='run'] Ran ${name} with job id: ${id} at ${start}, ran for ${timeTaken}s${
        (output !== undefined)
          ? ` with output: ${JSON.stringify(output)}.`
          : '.'
      } Error Message: ${error?.message}`,
    );
  },
);
// #endregion Define monitoring events
// Example of job with arguments and return output
a.addJob('job-1', {
  schedule: '* * * * *',
  action: async (a: string) => {
    console.log(a);
    await delay(1000);
    return 'ddfe';
  },
  arguments: ['sdasdfasdf'],
});

// Example of job with optional arguments defined in callback but none passed
a.addJob('job-2', {
  schedule: '*/2 * * * *',
  action: async (a?: number) => {
    console.log(a);
    await delay(2000);
    return;
  },
  arguments: [1],
});

// Example of job with arguments defined in callback but none or incorrect type passed.
// Wont throw error
a.addJob('job-3', {
  schedule: '*/2 * * * *',
  action: async (a: number) => {
    console.log(a);
    await delay(3000);
    return;
  },
  arguments: ['sdf'],
});

// Run every 5th minutes
a.addJob('job-4', {
  schedule: '*/5 * * * *',
  action: async () => {
    await delay(4000);
    return;
  },
});

// Run at a specific day and time
a.addJob('job-5', {
  schedule: '36 3 * * fri',
  action: async () => {
    await delay(5000);
    return;
  },
});

// Error
a.addJob('job-6', {
  schedule: '*/2 * * * *',
  action: async () => {
    await delay(6000);
    throw new Error('Boo');
  },
});

// Race condition
a.addJob('job-7', {
  schedule: '* * * * *',
  action: async () => {
    await delay(60 * 2 * 1000);
    return;
  },
});

// Lets start
a.start();

// Some time later
await delay(5 * 60 * 1000);

// Stop it
a.stop();
```

---

### Types

---

#### Callback

```ts
type Callback = (...args: any[]) => unknown | Promise<unknown>;
```

This is the callback function used in Cronus -> CronusJab.action.
This is not exported and not available for update.

`...args: any[]` - Arguments for the callback function

`returns: unknown | Promise<unknown>` - Return from the callback

#### CronusJob

```ts
CronusJob = {
  schedule: string;
  action: Callback;
  enable?: boolean;
  // deno-lint-ignore no-explicit-any
  arguments?: any[];
}
```

This defines a "job". Primarily used in addJob and updateJob.

`schedule: string` - The schedule at which to run

`action: Callback` - Callback function to call (ref, callback type)

`enable?: boolean` - If the job enabled

`arguments?: any[]` - The arguments to pass to the callback function

---

### Methods

---

#### addJob

```ts
addJob(name: string, jobDetails: CronusJob): Cronus
```

Add a new job to the collection with the specified name and job details

`name: string` - The name of the job to find

`jobDetails: CronusJob` - An object containing details about the job

`returns: Cronus` - Returns the Cronus instance

#### removeJob

```ts
public removeJob(name: string): Cronus
```

Removes a cron job from the scheduler

`name: string` - The name of the job to remove

`returns: Cronus` - Returns the Cronus instance

#### updateJob

```ts
public updateJob(name: string, jobDetails: CronusJob): Cronus
```

Updates a Cronus job with the given name and job details.

`name: string` - The name of the job to update.

`jobDetails: CronusJob` - The updated details for the job.

`returns: Cronus` - Returns the Cronus instance

#### enableJob

```ts
public enableJob(name: string): Cronus
```

Enables a Cronus job with the given name.

`name: string` - The name of the job to enable.

`returns: Cronus` - Returns the Cronus instance

#### disableJob

```ts
public disableJob(name: string): Cronus
```

Disables a Cronus job with the given name.

`name: string` - The name of the job to disable.

`returns: Cronus` - Returns the Cronus instance

#### getJob

```ts
public getJob(name: string): CronusJob
```

Find and return a job with the given name from the collection

`name: string` - The name of the job to find.

`returns: Cronus` - Returns the CronusJob object if found

`throws: CronusError` - This error is thrown if the job by the name is not found

#### hasJob

```ts
public hasJob(name: string): boolean
```

Check if a job with the given name exists

`name: string` - The name of the job to check for.

`returns: boolean` - Returns true if the job exists, false otherwise

#### start

```ts
public start(): void
```

Starts the Cronus scheduler. Runs active jobs every minute, starting from
the next full minute.

#### stop

```ts
public stop(): void
```

Stops the job scheduler if running

#### validateSchedule

```ts
public static validateSchedule(schedule: string): boolean
```

Validates a cron schedule syntax. Returns true if the schedule is valid, false otherwise.

`schedule: string` - The cron schedule to validate.

`returns: boolean` - Whether the schedule has a valid syntax.

#### getScheduledJobs

```ts
public getScheduledJobs(schedule: string): string[]
```

Returns an array of job names for a given schedule.

`schedule: string` - The cron schedule to get jobs for.

`returns: string[]` - An array of job names for the given schedule. Empty
array if schedule does not exist

#### canRun

```ts
public static canRun(cronExpression: string): boolean
```

Checks whether a given cron expression can run at the current date and time.

`cronExpression: strin` - The cron expression to check.

`returns: boolean` - Whether the expression can run at this moment.

---

### Events

---

There are a few events which can be used to check the execution of jobs
scheduled.

#### run

```ts
Cronus.on('run', (id: string,
    name: string,
    start: Date,
    timeTaken: number,
    output?: unknown,
    error?: Error,))
```

This event is triggered when a job is run. It is called after the callback has
finished execution (irrespective of wheather it throws and error or returns
an output)

`id: string` - The Job ID generated for this execution (UUID)

`name: string` - The name of the job as defined in Cronus

`start: Date` - The timestamp when the job eas started

`timeTaken: number` - Time taken for the job to execute

`output?: unknown` - Output given by the callback function (if any)

`error?: Error` - Error instances thrown by the callback (if any)

### start

```ts
Cronus.on('start', (id: string,
    name: string,
    start: Date))
```

This event is triggered when a the callback is being called.

`id: string` - The Job ID generated for this execution (UUID)

`name: string` - The name of the job as defined in Cronus

`start: Date` - The timestamp when the job eas started

### error

```ts
Cronus.on('run', (id: string,
    name: string,
    start: Date,
    timeTaken: number,
    error?: Error))
```

This event is triggered when an error is thrown in the callback function.

`id: string` - The Job ID generated for this execution (UUID)

`name: string` - The name of the job as defined in Cronus

`start: Date` - The timestamp when the job eas started

`timeTaken: number` - Time taken for the job to execute

`error?: Error` - Error instances thrown by the callback (if any)

### finish

```ts
Cronus.on('run', (id: string,
    name: string,
    start: Date,
    timeTaken: number,
    output?: unknown))
```

This event is triggered when the callback function has finished executing
successfully

`id: string` - The Job ID generated for this execution (UUID)

`name: string` - The name of the job as defined in Cronus

`start: Date` - The timestamp when the job eas started

`timeTaken: number` - Time taken for the job to execute

`output?: unknown` - Output given by the callback function (if any)

---

## TODO

---

- [x] Arguments support in callback
- [ ] Dynamic arguments (atleast arguments like time, jobId etc)
- [ ] Better test cases
- [ ] Handle race condition (job is running but taking too long, prevent next
      execution cycle from running same job)
- [ ] Timezone & Custom Date option when running jobs
