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

    await t.step('should handle mixed quotes and special characters', () => {
      const envPath = createTempEnvFile(`
MIXED_QUOTES="contains 'single' within double"
JSON_VALUE='{"key": "value"}'
URL="https://example.com/path?query=value"`);

      const result = envArgs(envPath);
      asserts.assertEquals(
        result.get('MIXED_QUOTES'),
        "contains 'single' within double",
      );
      asserts.assertEquals(result.get('JSON_VALUE'), '{"key": "value"}');
      asserts.assertEquals(
        result.get('URL'),
        'https://example.com/path?query=value',
      );
      // Clean up
      Deno.removeSync(envPath);
    });

    await t.step('should be immutable', () => {
      const result = envArgs();

      // Attempt to modify the result
      result.set('TEST_USER', 'new_value');

      // Verify immutability
      asserts.assertEquals(result.has('TEST_USER'), false);
      asserts.assertEquals(result.get('TEST_USER'), undefined);

      // Verify that other operations also don't work
      result.delete('HOME');
      asserts.assertEquals(
        result.keys().length,
        Object.keys(Deno.env.toObject()).length,
      );
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

// Mock Docker secrets for testing
const mockDockerSecrets = async (_t: Deno.TestContext) => {
  // Create a mock Docker secrets directory
  const secretsDir = path.join(Deno.cwd(), 'mock_secrets');
  try {
    await Deno.mkdir(secretsDir);
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }

  // Create test secrets
  Deno.writeTextFileSync(
    path.join(secretsDir, 'DB_PASSWORD'),
    'secret_db_password',
  );
  Deno.writeTextFileSync(path.join(secretsDir, 'API_KEY'), 'secret_api_key');

  // Setup and teardown
  return {
    secretsDir,
    cleanup: () => {
      try {
        Deno.removeSync(secretsDir, { recursive: true });
      } catch (error) {
        console.error(
          `Failed to clean up mock secrets: ${(error as Error).message}`,
        );
      }
    },
  };
};

// Docker secrets test - now implemented but still ignored by default
Deno.test({
  name: 'utils.envArgs - Docker secrets',
  permissions: { env: true, read: true, write: true },
  ignore: false, // Enable this test only in environments where Docker secrets can be tested
  async fn(t) {
    const originalReadDirSync = Deno.readDirSync;
    const originalReadTextFileSync = Deno.readTextFileSync;

    await t.step(
      'should not attempt to load Docker secrets when disabled',
      () => {
        const readDirSpy = spy(Deno, 'readDirSync');

        envArgs('./', false);

        assertSpyCalls(readDirSpy, 0);
        readDirSpy.restore();
      },
    );

    await t.step('should load Docker secrets when enabled', async () => {
      const { secretsDir, cleanup } = await mockDockerSecrets(t);

      try {
        // Mock implementation for Docker secrets path - update type signature to match Deno API
        Deno.readDirSync = function (
          path: string | URL,
        ): IteratorObject<Deno.DirEntry, unknown, unknown> {
          return (function* () {
            const pathStr = path instanceof URL ? path.pathname : path;
            if (pathStr === '/run/secrets') {
              yield* originalReadDirSync(secretsDir);
            } else {
              yield* originalReadDirSync(pathStr);
            }
          })() as IteratorObject<Deno.DirEntry, unknown, unknown>;
        };

        Deno.readTextFileSync = function (path: string | URL): string {
          const pathStr = path instanceof URL ? path.pathname : path;
          if (pathStr.startsWith('/run/secrets/')) {
            const secretName = pathStr.split('/').pop() || '';
            return originalReadTextFileSync(`${secretsDir}/${secretName}`);
          }
          return originalReadTextFileSync(pathStr);
        };

        const result = envArgs('./', true);

        asserts.assertEquals(result.get('DB_PASSWORD'), 'secret_db_password');
        asserts.assertEquals(result.get('API_KEY'), 'secret_api_key');
      } finally {
        // Restore original functions
        Deno.readDirSync = originalReadDirSync;
        Deno.readTextFileSync = originalReadTextFileSync;
        cleanup();
      }
    });
  },
});
