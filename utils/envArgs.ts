/**
 * @fileoverview Comprehensive environment variable and configuration loading utility.
 *
 * This module provides secure, flexible loading of environment variables from multiple sources:
 * - System environment variables
 * - .env files with various formats
 * - Docker secrets for containerized deployments
 * - Permission-aware loading for secure execution
 *
 * **Key Features:**
 * - Permission-aware environment access
 * - .env file parsing with quote handling
 * - Docker secrets integration
 * - Immutable result objects for security
 * - Error-resilient loading (continues on partial failures)
 * - Cross-platform compatibility
 *
 * **Security Features:**
 * - Respects Deno permission model
 * - Returns immutable objects to prevent tampering
 * - Graceful degradation when permissions denied
 * - Secure handling of sensitive configuration data
 *
 * **Use Cases:**
 * - Application configuration management
 * - Database connection strings and credentials
 * - API keys and secrets management
 * - Multi-environment deployments (dev/staging/prod)
 * - Docker and Kubernetes deployments
 * - CI/CD pipeline configuration
 *
 * @example Basic environment loading:
 * ```typescript
 * const env = envArgs();
 * const dbHost = env.get('DB_HOST') ?? 'localhost';
 * const apiKey = env.get('API_KEY');
 * ```
 *
 * @example Configuration with .env file:
 * ```typescript
 * // .env file:
 * // DB_HOST=localhost
 * // DB_PORT=5432
 * // API_KEY="secret-key-with-spaces"
 * // DEBUG=true
 *
 * const config = envArgs('./config/.env');
 * const dbConfig = {
 *   host: config.get('DB_HOST'),
 *   port: parseInt(config.get('DB_PORT') ?? '5432'),
 *   apiKey: config.get('API_KEY')
 * };
 * ```
 */

import * as path from '$path';
import { type PrivateObject, privateObject } from './privateObject.ts';

/**
 * Loads environment variables from multiple sources into a secure, immutable object.
 *
 * This function aggregates environment variables from:
 * 1. System environment variables (when env permission available)
 * 2. .env files (when read permission available)
 * 3. Docker secrets (when enabled and available)
 *
 * The loading process is permission-aware and fails gracefully when permissions
 * are not available, allowing applications to work in restricted environments.
 *
 * **Loading Priority (later sources override earlier ones):**
 * 1. System environment variables
 * 2. .env file variables
 * 3. Docker secrets
 *
 * **Supported .env Format:**
 * - KEY=value
 * - KEY="quoted value"
 * - KEY='single quoted'
 * - # Comments
 * - Empty lines (ignored)
 *
 * **Permission Requirements:**
 * - `--allow-env`: For system environment variables
 * - `--allow-read`: For .env files and Docker secrets
 * - Gracefully degrades when permissions not available
 *
 * @param envFilePath - Path to .env file or directory containing .env file (defaults to './')
 * @param loadDockerSecrets - Whether to load Docker secrets from /run/secrets (defaults to true)
 * @returns Immutable object containing all loaded environment variables
 *
 * @example Basic usage:
 * ```typescript
 * const env = envArgs();
 *
 * // Check if variables exist
 * if (env.has('DATABASE_URL')) {
 *   const dbUrl = env.get('DATABASE_URL');
 *   // Connect to database...
 * }
 *
 * // Get with default values
 * const port = env.get('PORT') ?? '3000';
 * const debug = env.get('DEBUG') === 'true';
 * ```
 *
 * @example Loading from specific .env file:
 * ```typescript
 * // Load from ./config/.env
 * const config = envArgs('./config/.env');
 *
 * // Load from specific file path
 * const prodConfig = envArgs('/etc/myapp/.env');
 *
 * // Disable Docker secrets loading
 * const basicConfig = envArgs('./', false);
 * ```
 *
 * @example Multi-environment configuration:
 * ```typescript
 * const environment = Deno.env.get('NODE_ENV') ?? 'development';
 * const envFile = `.env.${environment}`;
 *
 * const config = envArgs(envFile);
 *
 * const appConfig = {
 *   port: parseInt(config.get('PORT') ?? '3000'),
 *   dbHost: config.get('DB_HOST') ?? 'localhost',
 *   logLevel: config.get('LOG_LEVEL') ?? 'info',
 *   features: config.get('FEATURE_FLAGS')?.split(',') ?? []
 * };
 * ```
 *
 * @example Docker deployment with secrets:
 * ```typescript
 * // In Docker environment with mounted secrets
 * const env = envArgs('./config/.env', true);
 *
 * // Docker secrets override .env values
 * const dbPassword = env.get('db_password'); // From /run/secrets/db_password
 * const apiKey = env.get('api_key');         // From /run/secrets/api_key
 * ```
 *
 * @example Permission-aware loading:
 * ```typescript
 * const env = envArgs();
 *
 * // Function works even without permissions
 * // Returns empty object if no permissions available
 * const hasEnvAccess = env.has('PATH'); // May be false in restricted env
 *
 * // Always safe to call
 * const config = {
 *   fallback: env.get('CONFIG_VALUE') ?? 'default-value'
 * };
 * ```
 *
 * @example Configuration validation:
 * ```typescript
 * const env = envArgs();
 *
 * // Validate required environment variables
 * const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'REDIS_URL'];
 * const missing = requiredVars.filter(key => !env.has(key));
 *
 * if (missing.length > 0) {
 *   throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
 * }
 * ```
 *
 * **Error Handling:**
 * The function is designed to be resilient and never throw errors. Instead:
 * - Missing files are silently ignored
 * - Permission errors result in partial loading
 * - Malformed .env lines are skipped
 * - Docker secrets errors don't prevent env loading
 *
 * **Security Considerations:**
 * - Returns immutable objects to prevent accidental modification
 * - Respects Deno's permission model for security
 * - Sensitive data like passwords should use Docker secrets when possible
 * - Consider using environment-specific .env files for different deployment stages
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
      // Improved regex pattern to avoid Sonar warnings
      const pattern = /^\s*([\w.-]+)\s*=\s*(.+?)?\s*$/;
      const isQuoted = /^(['"])(.*)\1$/;

      data.split('\n').forEach((line) => {
        const match = line.match(pattern);
        if (match) {
          const [, key, value] = match;
          // Make sure key is defined before using it
          if (key) {
            if (!value) {
              env[key] = '';
            } else {
              let finalValue = value.trim();
              const quoteMatch = finalValue.match(isQuoted);
              if (quoteMatch) {
                finalValue = quoteMatch[2] ?? '';
              }
              env[key] = finalValue;
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
      const dockerSecretPath = '/run/secrets';
      const dockerSecretPermission = Deno.permissions.querySync({
        name: 'read',
        path: dockerSecretPath,
      });
      if (dockerSecretPermission.state === 'granted') {
        for (const file of Deno.readDirSync(dockerSecretPath)) {
          if (file.isFile) {
            const key = file.name;
            const value = Deno.readTextFileSync(
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
