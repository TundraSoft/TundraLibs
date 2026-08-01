/**
 * @fileoverview {@link RpcRegistrationError} — raised on duplicate
 * command / channel registration.
 *
 * @module
 */

import { RpcError } from './Base.ts';

/**
 * Thrown when a command or channel name is registered more than
 * once on the same Server. The receiver name is included in the
 * message; consumers can branch on `instanceof
 * RpcRegistrationError` to recover (e.g. in dev hot-reload).
 */
export class RpcRegistrationError extends RpcError {}
