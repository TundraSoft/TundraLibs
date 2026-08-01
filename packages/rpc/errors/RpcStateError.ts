/**
 * @fileoverview {@link RpcStateError} — raised when an operation
 * is attempted in an incompatible lifecycle state (e.g. sending on
 * a closed Server, calling `command()` before the Client connects,
 * middleware misuse).
 *
 * @module
 */

import { RpcError } from './Base.ts';

/**
 * Thrown when an operation is attempted in an incompatible
 * lifecycle state — server closed, client not connected,
 * middleware calling `next()` more than once, …
 */
export class RpcStateError extends RpcError {}
