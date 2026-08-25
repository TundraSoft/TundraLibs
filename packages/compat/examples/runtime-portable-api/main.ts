/**
 * @fileoverview Runnable entrypoint for the `runtime-portable-api` example.
 *
 * The point of this file: one HTTP service, written entirely against
 * `@tundralibs/compat`, that behaves identically on Deno, Bun, and Node —
 * because it never reaches for a runtime-only global (`Deno.serve`,
 * `Bun.serve`, `node:http`) directly.
 *
 * It detects the runtime (and refuses cleanly where a listening socket cannot
 * exist), starts the server on an ephemeral port, drives a handful of
 * in-process `fetch()` calls through the routes, prints the results in a
 * runtime-independent format, then shuts down and returns. No hanging demo,
 * no manual Ctrl-C.
 *
 * @module
 */

import {
  detectRuntime,
  isBrowser,
  isWorkers,
} from '@tundralibs/compat/runtime';
import { STATUS_TEXT } from '@tundralibs/compat/http';
import { createServer } from './server.ts';

/** One `fetch` to run against the running server. */
type Scenario = { path: string; accept: string };

const SCENARIOS: readonly Scenario[] = [
  { path: '/health', accept: 'application/json' },
  { path: '/health', accept: 'text/plain' },
  { path: '/health', accept: 'image/png' },
  { path: '/greeting.txt', accept: '*/*' },
  { path: '/nope', accept: '*/*' },
];

/** Format one result as a fixed-width, runtime-independent line. */
const formatResult = (
  scenario: Scenario,
  status: number,
  contentType: string,
  body: string,
): string =>
  `GET ${scenario.path}`.padEnd(18) +
  `Accept: ${scenario.accept}`.padEnd(26) +
  `-> ${status} ${STATUS_TEXT[status] ?? 'Unknown'}`.padEnd(22) +
  `[${contentType}]`.padEnd(28) +
  body;

async function main(): Promise<void> {
  // Graceful degradation, the compat way: detect the runtime and refuse with
  // a clear message where a port-listening server simply cannot exist, rather
  // than letting `WebServer.start()` surface an UnsupportedRuntimeError deeper
  // in. This example targets the three server runtimes on purpose.
  if (isWorkers || isBrowser) {
    console.error(
      `runtime-portable-api needs a listening socket, which ${detectRuntime()} ` +
        `does not provide. Run it on Deno, Bun, or Node.`,
    );
    return;
  }

  console.log(`Detected runtime: ${detectRuntime()}`);

  // The static asset lives next to this module, not in the process CWD.
  const staticDir = `${import.meta.dirname}/public`;
  const server = createServer(staticDir);

  await server.start();
  const base = `http://localhost:${server.port}`;
  console.log('Server started; running route scenarios:\n');

  try {
    for (const scenario of SCENARIOS) {
      const response = await fetch(`${base}${scenario.path}`, {
        headers: { accept: scenario.accept },
      });
      const contentType = response.headers.get('content-type') ?? '(none)';
      const body = await response.text();
      console.log(formatResult(scenario, response.status, contentType, body));
    }
  } finally {
    await server.stop();
  }

  console.log('\nServer stopped cleanly.');
}

// Called without top-level `await` so the file stays a plain, portable
// module (no TLA) — drop it into any project and run it directly.
main().catch((error) => {
  console.error(error);
});
