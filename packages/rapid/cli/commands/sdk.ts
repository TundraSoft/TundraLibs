/**
 * @fileoverview `rapid sdk <entry>` — write a typed client for the
 * application's HTTP API: a `@tundralibs/restler` class with one method
 * per route, `@tundralibs/guardian` validation of arguments and replies,
 * an `auth` option matching the security schemes given to `openapi()` /
 * `docs()`, and an error class for the server's error envelope.
 *
 * The entry module must export the application, or a function (sync or
 * async, no arguments) returning it, as `default` or `app`. The app is
 * read, never started.
 * @module
 */
import { makeDir, writeTextFile } from '@tundralibs/compat/file';
import { join } from '@tundralibs/compat/path';
import type { Application } from '../../Application.ts';
import {
  assembleOpenApi,
  mountedSecuritySchemes,
} from '../../endpoints/openapi.ts';
import { generateSdk } from '../sdk/generateSdk.ts';
import { loadApp } from './access.ts';

/**
 * The `sdk` command. Returns the exit code: 0, or 1 when the entry cannot
 * be loaded or the client cannot be generated.
 */
export async function sdkCommand(
  entry: string,
  opts: { out?: string; name?: string } = {},
  log: (line: string) => void = console.log,
): Promise<number> {
  const out = opts.out ?? './sdk';
  try {
    const app = await loadApp(entry) as unknown as Application;
    const sdk = generateSdk(
      assembleOpenApi(
        app,
        { securitySchemes: mountedSecuritySchemes(app) },
        new Map(),
        '',
      ),
      opts.name === undefined ? {} : { name: opts.name },
    );
    await makeDir(out, { recursive: true });
    for (const [file, source] of Object.entries(sdk.files)) {
      await writeTextFile(join(out, file), source);
    }
    for (const line of sdk.skipped) log(`- skipped ${line}`);
    for (const line of sdk.notes) log(`- ${line}`);
    log(
      `✓ ${sdk.methods.length} methods written to ${out} — it imports @tundralibs/restler, @tundralibs/guardian and @tundralibs/utils`,
    );
    return 0;
  } catch (error) {
    console.error(
      `✗ ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}
