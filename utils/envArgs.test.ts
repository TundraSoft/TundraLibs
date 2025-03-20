import * as asserts from '$asserts';
import { assertSpyCalls, spy } from '$testing/mock';
import * as path from '$path';
import { envArgs } from './envArgs.ts';

// Helper to create and clean up temporary .env files for testing
const createTempEnvFile = (content: string, filename = 'temp.env'): string => {
  const tempPath = path.join(Deno.cwd(), filename);
  Deno.writeTextFileSync(tempPath, content);
  return tempPath;
};

Deno.test({
  name: 'utils.envArgs - with full permissions',
  permissions: { env: true, read: true, write: true },
  async fn(t) {
    await t.step('should load system environment variables', () => {
      // Create a test environment variable
      Deno.env.set('TEST_ENV_VAR', 'test-value');

      const result = envArgs();

      asserts.assertEquals(typeof result, 'object');
      asserts.assertEquals(result.get('TEST_ENV_VAR'), 'test-value');

      // Clean up
      Deno.env.delete('TEST_ENV_VAR');
    });

    await t.step(
      'should load variables from .env file (directory path)',
      () => {
        const result = envArgs('utils/fixtures');

        asserts.assertEquals(result.get('USER'), 'TundraLib');
        asserts.assertEquals(result.get('HOME'), '/home/TundraLib');
      },
    );

    await t.step('should load variables from .env file (file path)', () => {
      const result = envArgs('utils/fixtures/sample2.env');

      asserts.assertEquals(result.get('USER'), 'TundraLib');
      asserts.assertEquals(result.get('HOME'), '');
    });

    await t.step('should handle quoted values correctly', () => {
      const envPath = createTempEnvFile(`
QUOTED_SINGLE='single quotes'
QUOTED_DOUBLE="double quotes"
UNQUOTED=no quotes
`);

      const result = envArgs(envPath);

      asserts.assertEquals(result.get('QUOTED_SINGLE'), 'single quotes');
      asserts.assertEquals(result.get('QUOTED_DOUBLE'), 'double quotes');
      asserts.assertEquals(result.get('UNQUOTED'), 'no quotes');

      // Clean up
      Deno.removeSync(envPath);
    });

    await t.step('should be immutable', () => {
      const result = envArgs();
      result.set('TEST_USER', 'new_value');

      asserts.assertEquals(result.has('TEST_USER'), false);
    });
  },
});

Deno.test({
  name: 'utils.envArgs - with read permission only',
  permissions: { env: false, read: true },
  async fn(t) {
    await t.step('should load variables only from file', () => {
      const result = envArgs('utils/fixtures');

      asserts.assertEquals(typeof result, 'object');
      asserts.assertEquals(result.keys().length, 3);
      asserts.assertEquals(result.get('USER'), 'TundraLib');
      asserts.assertEquals(result.get('HOME'), '/home/TundraLib');
    });

    await t.step('should handle file read errors gracefully', () => {
      const result = envArgs('utils/non_existent_directory');

      asserts.assertEquals(result.keys().length, 0);
    });
  },
});

Deno.test({
  name: 'utils.envArgs - with no permissions',
  permissions: { env: false, read: false },
  async fn(t) {
    await t.step(
      'should return empty object when no permissions available',
      () => {
        const result = envArgs('utils/fixtures');

        asserts.assertEquals(typeof result, 'object');
        asserts.assertEquals(result.keys().length, 0);
      },
    );
  },
});

// Test Docker secrets functionality if possible
Deno.test({
  name: 'utils.envArgs - Docker secrets',
  permissions: { env: true, read: true },
  ignore: true, // Enable this test only in environments where Docker secrets can be tested
  async fn(t) {
    await t.step(
      'should not attempt to load Docker secrets when disabled',
      () => {
        const readDirSpy = spy(Deno, 'readDirSync');

        envArgs('./', false);

        assertSpyCalls(readDirSpy, 0);
        readDirSpy.restore();
      },
    );
  },
});
