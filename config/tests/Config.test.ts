import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from '../../dev.dependencies.ts';

import {
  Config,
  ConfigError,
  ConfigNotDefined,
  ConfigNotFound,
  DuplicateConfig,
  MalformedConfig,
  ConfigPermissionError, 
} from '../mod.ts';

Deno.test({
  name: 'Config - No Permission', 
  permissions: { read: false },
  fn: async () => {
    await assertRejects(
      () => Config.load('config/tests/fixtures/valid/', 'sample'),
      ConfigPermissionError,
    );
  },
});

Deno.test('Config', async (t) => {
  await t.step('Load config', async () => {
    await Config.load('config/tests/fixtures/valid/', 'sample');
    // Should load only Sample config
    assertEquals(Config.list(), ['sample']);
    // Load the rest
    await Config.load('config/tests/fixtures/valid/', 'sample2');
    await Config.load('config/tests/fixtures/valid/', 'sample3');
    assertEquals(Config.list(), ['sample', 'sample2', 'sample3']);
  });

  await t.step('Check loaded config', () => {
    assert(Config.get('sample'));
    // Config name is not case sensitive
    assertEquals(Config.get('SamPle', 'title'), 'TOML Example');
    // But other keys are case sensitive
    assertEquals(Config.get('sample', 'Title'), undefined);
    // Fetching non-existent config should throw error
    assertThrows(() => Config.get('invalid'), ConfigNotDefined);
    assertEquals(Config.has('sample'), true);
    // Return false for config which is not present
    assertEquals(Config.has('sdf'), false);
    assertEquals(Config.has('sample', 'database', 'ports'), true);
    // Must return false on nested item not present
    assertEquals(Config.has('sample', 'database', 'portsdf'), false);

    assertEquals(Config.get('sample', 'userName'), '');
    // Load env
    Config.loadEnv('config/tests/fixtures/');
    assertEquals(Config.get('sample', 'userName'), 'TundraLib');
    // Undefined env variables will be set as empty string
    assertEquals(Config.get('sample', 'servers', 'alpha', 'ip'), '');
    // Escaped variables (double $$) will come with single $
    assertEquals(Config.get('sample', 'password'), '$PASSWORD');
  });

  await t.step('Test errors', () => {
    try {
      Config.get('sdfsdf');
    } catch (e) {
      if (e instanceof ConfigError) {
        assertEquals(e.config, 'sdfsdf');
        assert(e.toString().includes('Config sdfsdf'));
      }
    }
  });

  await t.step('Duplicate config', async () => {
    await assertRejects(
      () => Config.load('config/tests/fixtures/valid/', 'sample'),
      DuplicateConfig,
    );
    await assertRejects(
      () => Config.load('config/tests/fixtures/duplicate2/'),
      DuplicateConfig,
    );
    await assertRejects(
      () => Config.load('config/tests/fixtures/duplicate/'),
      DuplicateConfig,
    );
    await assertRejects(
      () => Config.load('config/tests/fixtures/duplicate/', 'SaMpLe'),
      DuplicateConfig,
    );
  });

  await t.step('Config not found', async () => {
    // Passing the file path directly
    await assertRejects(
      () => Config.load('config/tests/fixtures/valud/Sample.toml'),
      ConfigNotFound,
    );
    await assertRejects(
      () => Config.load('config/tests/fixtures/valid/', 'sdfkjghb'),
      ConfigNotFound,
    );
  });

  await t.step('Malformed', async () => {
    await assertRejects(
      () => Config.load('config/tests/fixtures/malformed/', 'malformedYml'),
      MalformedConfig,
    );
    await assertRejects(
      () => Config.load('config/tests/fixtures/malformed/', 'malformedToml'),
      MalformedConfig,
    );
    await assertRejects(
      () => Config.load('config/tests/fixtures/malformed/', 'malformedJSON'),
      MalformedConfig,
    );
  });
});
