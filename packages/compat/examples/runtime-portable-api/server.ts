/**
 * @fileoverview Wires the example's router onto a cross-runtime
 * {@link WebServer}. `port: 0` lets the OS pick a free port so the demo never
 * collides with a real service — read the real one back from `server.port`
 * after `start()`.
 *
 * @module
 */

import { WebServer } from '@tundralibs/compat/webserver';
import { createRouter } from './routes.ts';

/**
 * Construct (but do not start) the example server: TCP mode, ephemeral port,
 * bound to localhost.
 *
 * @param staticDir - Absolute directory holding the static assets.
 */
export const createServer = (staticDir: string): WebServer =>
  new WebServer('runtime-portable-api', {
    mode: 'TCP',
    port: 0,
    hostname: 'localhost',
    handler: createRouter(staticDir),
  });
