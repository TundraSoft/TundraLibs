import type { RequestInfo } from './RequestInfo.ts';

/**
 * Request handler. May be sync or async. If it throws, the server
 * returns 500 and emits `onError`. The request body can only be
 * consumed once — clone before reading if you need it twice. For
 * WebSocket upgrades, return the response from the websocket
 * helper.
 *
 * @example
 * ```ts
 * const handler: ServerHandler = async (req, info) => {
 *   if (new URL(req.url).pathname === '/health') return new Response('ok');
 *   return new Response('Not Found', { status: 404 });
 * };
 * ```
 */
export type ServerHandler = (
  request: Request,
  info: RequestInfo,
) => Response | Promise<Response>;
