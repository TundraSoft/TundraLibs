import { assertEquals, assertThrows } from '../../dev.dependencies.ts';
import { Cronus, CronusError } from '../mod.ts';

Deno.test('Cronus.addJob should add a job to Cronus', () => {
  const cronus = new Cronus();
  const name = 'test-job';
  const jobDetails = {
    schedule: '* * * * *',
    action: () => console.log('Test Job'),
  };

  cronus.addJob(name, jobDetails);

  assertEquals(cronus.hasJob(name), true);
});

Deno.test('Cronus.addJob should throw an error if job with same name already exists', () => {
  const cronus = new Cronus();
  const name = 'test-job';
  const jobDetails = {
    schedule: '* * * * *',
    action: () => console.log('Test Job'),
  };

  cronus.addJob(name, jobDetails);

  assertThrows(
    () => cronus.addJob(name, jobDetails),
    CronusError,
    `There is already a job with the same name ${name}`,
  );
});

Deno.test('Cronus.addJob should throw an error if invalid cron schedule is provided', () => {
  const cronus = new Cronus();
  const name = 'test-job';
  const jobDetails = {
    schedule: 'invalid-cron-schedule',
    action: () => console.log('Test Job'),
  };

  assertThrows(
    () => cronus.addJob(name, jobDetails),
    CronusError,
    `Invalid cron schedule provided`,
  );
});

Deno.test('Cronus.addJob should throw an error if action is not a callback function', () => {
  const cronus = new Cronus();
  const name = 'test-job';
  const jobDetails = {
    schedule: '* * * * *',
    action: 'not-a-function',
  };

  assertThrows(
    () => cronus.addJob(name, JSON.parse(JSON.stringify(jobDetails))),
    CronusError,
    `Expected action to be a callback function`,
  );
});

Deno.test('Cronus.addJob should add job to schedule if enable is not false', () => {
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

Deno.test('Cronus.addJob should not add job to schedule if enable is false', () => {
  const cronus = new Cronus();
  const name = 'test-job';
  const jobDetails = {
    schedule: '* * * * *',
    action: () => console.log('Test Job'),
    enable: false,
  };

  cronus.addJob(name, jobDetails);

  assertEquals(
    cronus.getScheduledJobs(jobDetails.schedule).includes(name),
    false,
  );
});
