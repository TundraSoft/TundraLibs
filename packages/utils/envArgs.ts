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
import { readDirSync, readTextFileSync } from '@tundralibs/compat/file';
import { hasPermissionSync } from '@tundralibs/compat/permissions';
import { getEnv } from '@tundralibs/compat/runtime';
import { type PrivateObject, privateObject } from './privateObject.ts';

const LINE = /^\s*([\w.-]+)\s*=(.*)/;
const QUOTED_VALUE = /^\s*(['"])(.*?)\1\s*(?:#.*)?$/;
const INLINE_COMMENT = /\s#.*$/;

const parseValue = (raw: string): string => {
  const quoted = QUOTED_VALUE.exec(raw);
  if (quoted) return quoted[2] ?? '';
  return raw.replace(INLINE_COMMENT, '').trim();
};

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
 * Blank lines and `#` comment lines are ignored. An unquoted value ends
 * at the first `#` preceded by whitespace (`KEY=abc # note` reads `abc`;
 * `KEY=pass#word` keeps the `#`); a quoted value is the text between its
 * quotes, with anything after the closing quote dropped. Quote a value to
 * keep a literal ` #`. Values are single-line.
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
      data.split('\n').forEach((line) => {
        const match = LINE.exec(line);
        if (match?.[1]) {
          env[match[1]] = parseValue(match[2] ?? '');
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
