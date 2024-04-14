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
} from '../mod.ts';

Deno.test('Config', async (t) => {
  await t.step('Load config', async () => {
    await Config.load('config/tests/fixtures/valid/', 'sample');
    // Should load only Sample config
    assertEquals(Config.list(), ['sample']);
    // Load the rest
    await Config.load('config/tests/fixtures/valid/', 'sample2');
    await Config.load('config/tests/fixtures/valid/', 'sample3');
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
    assertEquals(Config.has('sample', 'database', 'ports'), true);
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

  await t.step('Duplicate config', () => {
    assertRejects(
      () => Config.load('config/tests/fixtures/valid/', 'sample'),
      DuplicateConfig,
    );
    assertRejects(
      () => Config.load('config/tests/fixtures/duplicate2/'),
      DuplicateConfig,
    );
    assertRejects(
      () => Config.load('config/tests/fixtures/duplicate/'),
      DuplicateConfig,
    );
    assertRejects(
      () => Config.load('config/tests/fixtures/duplicate/', 'SaMpLe'),
      DuplicateConfig,
    );
  });

  await t.step('Config not found', () => {
    assertRejects(
      () => Config.load('config/tests/fixtures/valid/', 'sdfkjghb'),
      ConfigNotFound,
    );
  });

  await t.step('Malformed', () => {
    assertRejects(
      () => Config.load('config/tests/fixtures/malformed/', 'malformedYml'),
      MalformedConfig,
    );
    assertRejects(
      () => Config.load('config/tests/fixtures/malformed/', 'malformedToml'),
      MalformedConfig,
    );
    assertRejects(
      () => Config.load('config/tests/fixtures/malformed/', 'malformedJSON'),
      MalformedConfig,
    );
  });
});
