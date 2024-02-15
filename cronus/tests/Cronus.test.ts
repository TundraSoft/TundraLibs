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
});
