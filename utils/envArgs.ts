import { path } from '../dependencies.ts';
import { privateObject } from './privateObject.ts';

/**
 * Retrieves environment variables and returns them as an object.
 *
 * @param envFilePath - The file path to load additional environment variables from. Defaults to './'.
 * @param loadDockerSecrets - Determines whether to load Docker secrets. Defaults to true.
 * @returns An object containing environment variables.
 */
export const envArgs = function (
  envFilePath = './',
  loadDockerSecrets = true,
) {
  const env: Record<string, string> = {};
  try {
    const envPermission = Deno.permissions.querySync({ name: 'env' });
    if (envPermission.state === 'granted') {
      Object.entries(Deno.env.toObject()).forEach(([key, value]) => {
        env[key] = value;
      });
    }
  } catch {
    // Suppress error
  }

  try {
    const envFile = path.join(Deno.cwd(), envFilePath, '.env'),
      filePermission = Deno.permissions.querySync({
        name: 'read',
        path: envFile,
      });
    if (filePermission.state === 'granted') {
      const data = Deno.readTextFileSync(envFile);
      const pattern = new RegExp(/^\s*([\w.-]+)\s*=\s*(.+?)\s*$/);
      const isQuoted = new RegExp(/^('|")[^\1].*(\1)$/);

      data.split('\n').forEach((line) => {
        if (pattern.test(line)) {
          const [, key, value] = line.match(pattern) as RegExpMatchArray;
          env[key] = ((isQuoted.test(value) ? value.slice(1, -1) : value) || '')
            .trim();
        }
      });
    }
  } catch {
    // Suppress error
  }

  if (loadDockerSecrets) {
    try {
      const dockerSecretPermission = Deno.permissions.querySync({
        name: 'read',
        path: '/run/secrets',
      });
      if (dockerSecretPermission.state === 'granted') {
        for (const file of Deno.readDirSync('/run/secrets')) {
          const key = file.name;
          const value = Deno.readTextFileSync(path.join('/run/secrets', key));
          env[key] = value;
        }
      }
    } catch {
      // Suppress error
    }
  }

  return privateObject(env, false);
};
