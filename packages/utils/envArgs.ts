/**
 * @fileoverview Load environment variables from system env, `.env` files,
 * and Docker secrets into a single immutable view.
 *
 * Permission-aware: skips sources for which read/env permission isn't
 * granted, and never throws on missing files or malformed lines.
 *
 * @module
 */

import * as path from '@tundralibs/compat/path';
import {
  getEnv,
  hasPermissionSync,
  readDirSync,
  readTextFileSync,
} from '@tundralibs/compat';
import { type PrivateObject, privateObject } from './privateObject.ts';

/**
 * Aggregate env vars from system env, an `.env` file, and Docker secrets
 * into one immutable view.
 *
 * Sources are merged in order, later overriding earlier:
 * 1. System environment (needs `--allow-env`)
 * 2. `.env` file (needs `--allow-read` on the file)
 * 3. Docker secrets directory (needs `--allow-read` on the dir)
 *
 * Sources for which permission is denied are silently skipped. The
 * function never throws — missing files, malformed lines, and missing
 * permissions all result in a smaller (possibly empty) result.
 *
 * Supported `.env` syntax: `KEY=value`, `KEY="quoted"`, `KEY='quoted'`.
 * Comments and blank lines are ignored.
 *
 * @param envFilePath - Path to a `.env` file, or a directory whose
 *   `.env` should be loaded. Defaults to `'./'`.
 * @param loadDockerSecrets - `true` (default) reads `/run/secrets`,
 *   `false` disables, a string overrides the path (useful in tests or
 *   non-default deployments).
 * @returns Immutable {@link PrivateObject} of merged variables.
 *
 * @example
 * ```typescript
 * const env = envArgs('./config/.env');
 * const port = parseInt(env.get('PORT') ?? '3000');
 * const dbUrl = env.get('DATABASE_URL');
 * ```
 */
export const envArgs = function ( // NOSONAR - complexity cannot be reduced further
  envFilePath = './',
  loadDockerSecrets: boolean | string = true,
): PrivateObject<Record<string, string>> {
  const env: Record<string, string> = {};
  const envPermission = hasPermissionSync({ name: 'env' });
  if (envPermission === true) {
    Object.entries(getEnv()).forEach(([key, value]) => {
      env[key] = value;
    });
  }

  try {
    // Simplify path resolution logic
    const envFile = envFilePath.endsWith('.env')
      ? envFilePath
      : path.join(envFilePath, '.env');
    const filePermission = hasPermissionSync({
      name: 'read',
      path: envFile,
    });
    if (filePermission === true) {
      const data = readTextFileSync(envFile);
      // Improved regex pattern to avoid Sonar warnings
      const pattern = /^\s*([\w.-]+)\s*=\s*(.+?)?\s*$/;
      const isQuoted = /^(['"])(.*)\1$/;

      data.split('\n').forEach((line) => {
        const match = pattern.exec(line);
        if (match) {
          const [, key, value] = match;
          // Make sure key is defined before using it
          if (key) {
            if (value) {
              let finalValue = value.trim();
              const quoteMatch = isQuoted.exec(finalValue);
              if (quoteMatch) {
                finalValue = quoteMatch[2] ?? '';
              }
              env[key] = finalValue;
            } else {
              env[key] = '';
            }
          }
        }
      });
    }
  } catch {
    // Log error in development environments if needed
    // console.debug(`Error loading .env file: ${error.message}`);
  }

  if (loadDockerSecrets) {
    try {
      const dockerSecretPath = typeof loadDockerSecrets === 'string'
        ? loadDockerSecrets
        : '/run/secrets';
      const dockerSecretPermission = hasPermissionSync({
        name: 'read',
        path: dockerSecretPath,
      });
      if (dockerSecretPermission === true) {
        for (const file of readDirSync(dockerSecretPath)) {
          if (file.isFile) {
            const key = file.name;
            const value = readTextFileSync(
              path.join(dockerSecretPath, key),
            );
            env[key] = value.trim();
          }
        }
      }
    } catch {
      // Log error in development environments if needed
      // console.debug(`Error loading Docker secrets: ${error.message}`);
    }
  }

  return privateObject(env, false);
};
