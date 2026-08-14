import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  cwd,
  isBun,
  isDeno,
  isNode,
  makeDirSync,
  removeSync,
  writeTextFileSync,
} from '@tundralibs/compat';
import * as path from '@tundralibs/compat/path';
import { envArgs } from './envArgs.ts';

// Runtime-aware env manipulation helpers
const setEnv = (key: string, value: string) => {
  if (isDeno) {
    Deno.env.set(key, value);
  } else if (isBun || isNode) {
    process.env[key] = value;
  }
};

const deleteEnv = (key: string) => {
  if (isDeno) {
    Deno.env.delete(key);
  } else if (isBun || isNode) {
    delete process.env[key];
  }
};

// Helper to create and clean up temporary .env files for testing
const createTempEnvFile = (content: string, filename = 'temp.env'): string => {
  const tempPath = path.join(cwd(), filename);
  writeTextFileSync(tempPath, content);
  return tempPath;
};

describe({
  name: 'utils.envArgs - with full permissions',
  permissions: { env: true, read: true, write: true },
  fn() {
    it('should load system environment variables', () => {
      // Create a test environment variable
      setEnv('TEST_ENV_VAR', 'test-value');

      const result = envArgs();

      asserts.assertEquals(typeof result, 'object');
      asserts.assertEquals(result.get('TEST_ENV_VAR'), 'test-value');

      // Clean up
      deleteEnv('TEST_ENV_VAR');
    });

    it(
      'should load variables from .env file (directory path)',
      () => {
        const result = envArgs('packages/utils/fixtures/sample2.env');

        asserts.assertEquals(result.get('USER'), 'TundraLib');
        asserts.assertEquals(result.get('HOME'), '');
      },
    );

    it('should load variables from .env file (file path)', () => {
      const result = envArgs('packages/utils/fixtures/sample2.env');

      asserts.assertEquals(result.get('USER'), 'TundraLib');
      asserts.assertEquals(result.get('HOME'), '');
    });

    it('should handle quoted values correctly', () => {
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
      removeSync(envPath);
    });

    it('should handle mixed quotes and special characters', () => {
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
      removeSync(envPath);
    });

    it('should be immutable', () => {
      const result = envArgs();
      // Attempt to modify the result
      result.set('TEST_USER', 'new_value');
      // Verify immutability
      asserts.assertEquals(result.has('TEST_USER'), false);
      asserts.assertEquals(result.get('TEST_USER'), undefined);

      // Verify that other operations also don't work
      result.delete('HOME');
      const envLength = envArgs().keys().length;
      asserts.assertEquals(
        result.keys().length,
        envLength,
      );
    });
  },
});

describe({
  name: 'utils.envArgs - with read permission only',
  permissions: { env: false, read: true },
  deno: true,
  bun: false,
  node: false,
  fn() {
    it('should load variables only from file', () => {
      const result = envArgs('packages/utils/fixtures/sample2.env');

      asserts.assertEquals(typeof result, 'object');
      asserts.assertEquals(result.keys().length, 2);
      asserts.assertEquals(result.get('USER'), 'TundraLib');
      asserts.assertEquals(result.get('HOME'), '');
    });

    it('should handle file read errors gracefully', () => {
      const result = envArgs('packages/utils/non_existent_directory');
      asserts.assertEquals(result.keys().length, 0);
    });
  },
});

describe({
  name: 'utils.envArgs - with no permissions',
  permissions: { env: false, read: false },
  deno: true,
  bun: false,
  node: false,
  fn() {
    it(
      'should return empty object when no permissions available',
      () => {
        const result = envArgs('packages/utils/fixtures/sample2.env');
        asserts.assertEquals(typeof result, 'object');
        asserts.assertEquals(result.keys().length, 0);
      },
    );
  },
});

/**
 * Stand up a real fixture directory of secrets — files containing the
 * value, named after the env key. Cross-runtime via `compat`'s file
 * helpers; no monkey-patching of runtime APIs needed because
 * `envArgs(..., dirPath)` accepts the path directly.
 */
const setupSecretsDir = (
  contents: Record<string, string>,
): { secretsDir: string; cleanup: () => void } => {
  const secretsDir = path.join(cwd(), `mock_secrets_${Date.now()}`);
  try {
    makeDirSync(secretsDir);
  } catch (error) {
    if (
      !(error instanceof Error &&
        (error.message.includes('already exists') ||
          error.message.includes('EEXIST')))
    ) {
      throw error;
    }
  }

  for (const [key, value] of Object.entries(contents)) {
    writeTextFileSync(path.join(secretsDir, key), value);
  }

  return {
    secretsDir,
    cleanup: () => {
      try {
        removeSync(secretsDir);
      } catch (error) {
        console.error(
          `Failed to clean up mock secrets: ${(error as Error).message}`,
        );
      }
    },
  };
};

describe({
  name: 'utils.envArgs - Docker secrets',
  permissions: { env: true, read: true, write: true },
  fn() {
    it('should not attempt to load Docker secrets when disabled', () => {
      // With `loadDockerSecrets: false`, the secrets directory is
      // never inspected — even if one existed at the default path,
      // the keys wouldn't make it into the result.
      const { cleanup } = setupSecretsDir({ SHOULD_NOT_LOAD: 'absent' });
      try {
        const result = envArgs('./', false);
        asserts.assertEquals(result.get('SHOULD_NOT_LOAD'), undefined);
      } finally {
        cleanup();
      }
    });

    it('should load Docker secrets from a configured directory', () => {
      const { secretsDir, cleanup } = setupSecretsDir({
        DB_PASSWORD: 'secret_db_password',
        API_KEY: 'secret_api_key',
      });
      try {
        const result = envArgs('./', secretsDir);
        asserts.assertEquals(result.get('DB_PASSWORD'), 'secret_db_password');
        asserts.assertEquals(result.get('API_KEY'), 'secret_api_key');
      } finally {
        cleanup();
      }
    });

    it('should trim trailing whitespace / newlines from secret values', () => {
      const { secretsDir, cleanup } = setupSecretsDir({
        TOKEN: 'value-with-newline\n',
      });
      try {
        const result = envArgs('./', secretsDir);
        asserts.assertEquals(result.get('TOKEN'), 'value-with-newline');
      } finally {
        cleanup();
      }
    });
  },
});
