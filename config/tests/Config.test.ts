import { asserts } from '../../dev.dependencies.ts';

import {
  Config,
  ConfigError,
  ConfigNotDefined,
  ConfigNotFound,
  ConfigPermissionError,
  DuplicateConfig,
  MalformedConfig,
} from '../mod.ts';

Deno.test({
  name: 'Config - No Permission',
  permissions: { read: false },
  fn: async () => {
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/valid/', 'sample'),
      ConfigPermissionError,
    );
  },
});

Deno.test('Config', async (t) => {
  await t.step('Invalid path', () => {
    asserts.assertRejects(
      async () => await Config.load('config/tests/fixtures/valid/Sample.yaml'),
      ConfigNotFound,
    );
  });

  await t.step('Load config', async () => {
    await Config.load('config/tests/fixtures/valid/', 'sample');
    // Should load only Sample config
    asserts.assertEquals(Config.list(), ['sample']);
    // Load the rest
    await Config.load('config/tests/fixtures/valid/', 'sample2');
    await Config.load('config/tests/fixtures/valid/', 'sample3');
    asserts.assertEquals(Config.list(), ['sample', 'sample2', 'sample3']);
    Config.clear();
  });

  await t.step('Check loaded config', async () => {
    await Config.load('config/tests/fixtures/valid/', 'sample');
    asserts.assert(Config.get('sample'));
    // Config name is not case sensitive
    asserts.assertEquals(Config.get('SamPle', 'title'), 'TOML Example');
    // But other keys are case sensitive
    asserts.assertEquals(Config.get('sample', 'Title'), undefined);
    // Fetching non-existent config should throw error
    asserts.assertThrows(() => Config.get('invalid'), ConfigNotDefined);
    asserts.assertEquals(Config.has('sample'), true);
    // Return false for config which is not present
    asserts.assertEquals(Config.has('sdf'), false);
    asserts.assertEquals(Config.has('sample', 'database', 'ports'), true);
    // Must return false on nested item not present
    asserts.assertEquals(Config.has('sample', 'database', 'portsdf'), false);

    asserts.assertEquals(Config.get('sample', 'userName'), '');
    // Load env
    Config.loadEnv('config/tests/fixtures/');
    asserts.assertEquals(Config.get('sample', 'userName'), 'TundraLib');
    // Undefined env variables will be set as empty string
    asserts.assertEquals(Config.get('sample', 'servers', 'alpha', 'ip'), '');
    // Escaped variables (double $$) will come with single $
    asserts.assertEquals(Config.get('sample', 'password'), '$PASSWORD');
  });

  await t.step('Test errors', () => {
    try {
      Config.get('sdfsdf');
    } catch (e) {
      if (e instanceof ConfigError) {
        asserts.assertEquals(e.config, 'sdfsdf');
        asserts.assert(e.toString().includes('Config sdfsdf'));
      }
    }
  });

  await t.step('Duplicate config', async () => {
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/valid/', 'sample'),
      DuplicateConfig,
      'Config with the name sample already loaded',
    );
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/duplicate2/'),
      DuplicateConfig,
      'Multiple config files found for test in config/tests/fixtures/duplicate2/',
    );
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/duplicate/'),
      DuplicateConfig,
    );
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/duplicate/', 'SaMpLe'),
      DuplicateConfig,
    );
  });

  await t.step('Config not found', async () => {
    // Passing the file path directly
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/valud/Sample.toml'),
      ConfigNotFound,
    );
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/valid/', 'sdfkjghb'),
      ConfigNotFound,
    );
  });

  await t.step('Malformed', async () => {
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/malformed/', 'malformedYml'),
      MalformedConfig,
    );
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/malformed/', 'malformedToml'),
      MalformedConfig,
    );
    await asserts.assertRejects(
      () => Config.load('config/tests/fixtures/malformed/', 'malformedJSON'),
      MalformedConfig,
    );
  });
});
