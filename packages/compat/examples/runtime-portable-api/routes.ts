/**
 * @fileoverview Request router for the `runtime-portable-api` example. Maps a
 * few routes onto the cross-cutting HTTP helpers from
 * `@tundralibs/compat/http` (content negotiation, status text, content-type)
 * and a static file read through `@tundralibs/compat/file`. Nothing here
 * touches a runtime-only global, so the exact same handler runs unchanged on
 * Deno, Bun, and Node.
 *
 * @module
 */

import {
  contentTypeFor,
  negotiate,
  STATUS_TEXT,
} from '@tundralibs/compat/http';
import { FileNotFound, readTextFile } from '@tundralibs/compat/file';
import { join } from '@tundralibs/compat/path';
import type { ServerHandler } from '@tundralibs/compat/webserver';

/** Media types `GET /health` can produce, in server-preference order. */
const HEALTH_OFFERS = ['application/json', 'text/plain'] as const;

/** A `text/plain` response whose body is the status' canonical reason phrase. */
const statusResponse = (status: number): Response =>
  new Response(STATUS_TEXT[status] ?? 'Unknown', {
    status,
    headers: { 'content-type': 'text/plain' },
  });

/**
 * Build the {@link ServerHandler} for the example, closing over the directory
 * that holds the static assets.
 *
 * Routes:
 * - `GET /health` — content-negotiated between `application/json` and
 *   `text/plain`; `406` when the client accepts neither.
 * - `GET /greeting.txt` — a file read through `@tundralibs/compat/file`, typed
 *   via `contentTypeFor`; `404` if it is missing.
 * - anything else — `404`.
 *
 * @param staticDir - Absolute directory holding `greeting.txt`.
 */
export const createRouter = (staticDir: string): ServerHandler => {
  return async (request, _info) => {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      const chosen = negotiate(request.headers.get('accept'), HEALTH_OFFERS);
      if (chosen === undefined) return statusResponse(406);
      const body = chosen === 'application/json' ? '{"status":"ok"}' : 'ok';
      return new Response(body, {
        status: 200,
        headers: { 'content-type': chosen },
      });
    }

    if (request.method === 'GET' && url.pathname === '/greeting.txt') {
      try {
        const text = await readTextFile(join(staticDir, 'greeting.txt'));
        return new Response(text, {
          status: 200,
          headers: { 'content-type': contentTypeFor('greeting.txt') },
        });
      } catch (error) {
        if (error instanceof FileNotFound) return statusResponse(404);
        throw error;
      }
    }

    return statusResponse(404);
  };
};
