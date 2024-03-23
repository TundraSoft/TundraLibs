import {
  assertEquals,
  assertThrows,
  describe,
  it,
} from '../../dev.dependencies.ts';
import {
  Cronus,
  CronusDuplicateJob,
  CronusInvalidCallback,
  CronusInvalidSchedule,
  type CronusJob,
  CronusJobNotFound,
} from '../mod.ts';

describe('Cronus', () => {
  it('Cronus.addJob should add a job to Cronus', () => {
    const cronus = new Cronus();
    const name = 'test-job';
    const jobDetails = {
      schedule: '* * * * *',
      action: () => console.log('Test Job'),
    };

    cronus.addJob(name, jobDetails);

    assertEquals(cronus.hasJob(name), true);
  });

  it('Cronus.addJob should throw an error if job with same name already exists', () => {
    const cronus = new Cronus();
    const name = 'test-job';
    const jobDetails = {
      schedule: '* * * * *',
      action: () => console.log('Test Job'),
    };

    cronus.addJob(name, jobDetails);

    assertThrows(
      () => cronus.addJob(name, jobDetails),
      CronusDuplicateJob,
    );
  });

  it('Cronus.addJob should throw an error if invalid cron schedule is provided', () => {
    const cronus = new Cronus();
    const name = 'test-job';
    const jobDetails = {
      schedule: 'invalid-cron-schedule',
      action: () => console.log('Test Job'),
    };

    assertThrows(
      () => cronus.addJob(name, jobDetails),
      CronusInvalidSchedule,
    );
  });

  it('Cronus.addJob should throw an error if action is not a callback function', () => {
    const cronus = new Cronus();
    const name = 'test-job';
    const jobDetails = {
      schedule: '* * * * *',
      action: 'not-a-function',
    };

    assertThrows(
      () => cronus.addJob(name, JSON.parse(JSON.stringify(jobDetails))),
      CronusInvalidCallback,
    );
  });

  it('Cronus.addJob should add job to schedule if enable is not false', () => {
    const cronus = new Cronus();
    const name = 'test-job';
    const jobDetails = {
      schedule: '* * * * *',
      action: () => console.log('Test Job'),
    };

    cronus.addJob(name, jobDetails);

    assertEquals(
      cronus.getScheduledJobs(jobDetails.schedule).includes(name),
      true,
    );
  });

  it('Cronus.getScheduleJobs should return all jobs scheduled at a particular time', () => {
    const cronus = new Cronus();
    const name = 'test-job';
    const jobDetails = {
      schedule: '* * * * *',
      action: () => console.log('Test Job'),
    };

    cronus.addJob(name, jobDetails);

    assertEquals(
      cronus.getScheduledJobs(jobDetails.schedule).includes(name),
      true,
    );
  });

  it('Test all features', () => {
    const cronus = new Cronus();

    // Test initial properties
    assertEquals(cronus.hasJob('testJob'), false);

    // Test adding a job
    const jobDetails: CronusJob = {
      schedule: '* * * * *',
      action: () => console.log('Test job'),
    };
    cronus.addJob('testJob', jobDetails);
    assertEquals(cronus.hasJob('testJob'), true);

    // Test getting a job
    assertEquals(cronus.getJob('testJob'), jobDetails);

    // Test adding a duplicate job
    assertThrows(
      () => cronus.addJob('testJob', jobDetails),
      CronusDuplicateJob,
    );

    // Test adding a job with invalid schedule
    const invalidJobDetails: CronusJob = {
      schedule: 'invalid',
      action: () => console.log('Invalid job'),
    };
    assertThrows(
      () => cronus.addJob('invalidJob', invalidJobDetails),
      CronusInvalidSchedule,
    );

    // Test adding a job with invalid callback
    const invalidCallbackJobDetails: CronusJob = {
      schedule: '* * * * *',
      action: 'invalid',
    } as unknown as CronusJob;
    assertThrows(
      () => cronus.addJob('invalidCallbackJob', invalidCallbackJobDetails),
      CronusInvalidCallback,
    );

    // Test removing a job
    cronus.removeJob('testJob');
    assertEquals(cronus.hasJob('testJob'), false);

    // Test getting a non-existent job
    assertThrows(() => cronus.getJob('testJob'), CronusJobNotFound);

    // Test updating a job
    const updatedJobDetails: CronusJob = {
      schedule: '* * * * *',
      action: () => console.log('Updated job'),
    };
    cronus.addJob('updatedJob', updatedJobDetails);
    const newJobDetails: CronusJob = {
      schedule: '* * * * *',
      action: () => console.log('New job'),
    };
    cronus.updateJob('updatedJob', newJobDetails);
    assertEquals(cronus.getJob('updatedJob'), newJobDetails);

    // Test enabling and disabling a job
    cronus.disableJob('updatedJob');
    assertEquals(cronus.getJob('updatedJob').enable, false);
    cronus.enableJob('updatedJob');
    assertEquals(cronus.getJob('updatedJob').enable, true);

    // Test getting scheduled jobs
    assertEquals(cronus.getScheduledJobs('* * * * *'), ['updatedjob']);

    // Test starting and stopping the scheduler
    cronus.start();
    cronus.stop();

    // Test canRun static method
    assertEquals(Cronus.canRun('* * * * *'), true);
    assertEquals(Cronus.canRun('invalid'), false);

    // Test validateSchedule static method
    assertEquals(Cronus.validateSchedule('* * * * *'), true);
    assertEquals(Cronus.validateSchedule('invalid'), false);
  });
});
