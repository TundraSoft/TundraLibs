/**
 * @fileoverview Event-callback signatures for {@link WebServer}.
 *
 * @module
 */

import { ServerError } from '../Error.ts';
import type { RequestInfo } from './RequestInfo.ts';
import { ServerMode } from './mod.ts';

/**
 * Callbacks registered via `server.on('name', cb)`. The first argument
 * to every callback is the server name (passed to the constructor).
 */
export type ServerEvents = {
  /**
   * Fires after the response is flushed to the client. Modifying
   * `response` here is a no-op — wrap the handler instead.
   */
  onResponse: (
    name: string,
    request: Request,
    info: RequestInfo,
    response: Response,
  ) => void;

  /**
   * Fires when request processing throws or otherwise fails. The
   * server still returns 500 to the client; this is for logging only.
   * `request` and `info` may be undefined if the failure happened
   * before they were assigned (e.g. malformed request).
   */
  onError: (
    name: string,
    error: ServerError,
    request?: Request,
    info?: RequestInfo,
  ) => void;

  /** Non-fatal warning during startup or runtime (deprecations, capability gaps). */
  onWarning: (name: string, message: string) => void;

  /** Fires once the listener is bound. The server may not have served a request yet. */
  onStart: (name: string, mode: ServerMode) => void;

  /**
   * Fires after the listener is closed. For UNIX sockets the socket
   * file is already cleaned up; in-flight connections may still be
   * draining.
   */
  onClose: (name: string, mode: ServerMode) => void;
};
