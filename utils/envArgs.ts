import * as path from '$path';
import { type PrivateObject, privateObject } from './privateObject.ts';

/**
 * Retrieves environment variables and returns them as an object.
 *
 * @param envFilePath - The file path to load additional environment variables from. Defaults to './'.
 * @param loadDockerSecrets - Determines whether to load Docker secrets. Defaults to true.
 * @returns An object containing environment variables.
 *
 * @example
 * ```ts
 * // Basic usage
 * const env = envArgs();
 * console.log(env); // Logs all environment variables
 * ```
 *
 * @example
 * ```ts
 * // Load environment variables from a specific .env file
 * const env = envArgs('./config/.env');
 * console.log(env); // Logs environment variables including those from the specified .env file
 * ```
 *
 * @example
 * ```ts
 * // Load environment variables and Docker secrets
 * const env = envArgs('./config/.env', true);
 * console.log(env); // Logs environment variables including those from the specified .env file and Docker secrets
 * ```
 */
export const envArgs = function (
  envFilePath = './',
  loadDockerSecrets = true,
): PrivateObject<Record<string, string>> {
  const env: Record<string, string> = {};
  const envPermission = Deno.permissions.querySync({ name: 'env' });
  if (envPermission.state === 'granted') {
    Object.entries(Deno.env.toObject()).forEach(([key, value]) => {
      env[key] = value;
    });
  }

  try {
    // Simplify path resolution logic
    const envFile = envFilePath.endsWith('.env')
      ? envFilePath
      : path.join(envFilePath, '.env');

    const filePermission = Deno.permissions.querySync({
      name: 'read',
      path: envFile,
    });
    if (filePermission.state === 'granted') {
      const data = Deno.readTextFileSync(envFile);
      const pattern = new RegExp(/^\s*([\w.-]+)\s*=\s*(.+?)?\s*$/); // NOSONAR
      const isQuoted = new RegExp(/^('|")[^'"].*\1$/);
      data.split('\n').forEach((line) => {
        const match = line.match(pattern);
        if (match) {
          const [, key, value] = match;
          // Make sure key is defined before using it
          if (key) {
            if (!value) {
              env[key] = '';
            } else {
              env[key] = isQuoted.test(value)
                ? value.slice(1, -1).trim()
                : value.trim();
            }
          }
        }
      });
    }
  } catch {
    // Nothing to do, we die gracefully
  }

  if (loadDockerSecrets) {
    try {
      const dockerSecretPath = '/run/secrets';
      const dockerSecretPermission = Deno.permissions.querySync({
        name: 'read',
        path: dockerSecretPath,
      });
      if (dockerSecretPermission.state === 'granted') {
        for (const file of Deno.readDirSync(dockerSecretPath)) {
          const key = file.name;
          const value = Deno.readTextFileSync(path.join(dockerSecretPath, key));
          env[key] = value;
        }
      }
    } catch {
      // Nothing to do, we die gracefully
    }
  }

  return privateObject(env, false);
};
