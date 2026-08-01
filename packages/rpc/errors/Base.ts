/**
 * @fileoverview Base error class for `@tundralibs/rpc`.
 *
 * All RPC errors extend this class. Concrete derived classes
 * describe the failure mode; consumers branch with `instanceof`.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';

/**
 * Base error for the rpc package. Concrete RPC errors extend this
 * class.
 *
 * Extends {@link BaseError} from `@tundralibs/utils` so every rpc
 * error shares the project-wide error contract: typed `context`,
 * `${var}` substitution in messages, cause chaining, and JSON
 * serialization via `toJSON()`. `instanceof Error` remains `true`.
 *
 * @typeParam M - Shape of the structured `context` record attached to
 *   the error. Defaults to an open string-keyed record.
 */
export class RpcError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  // `name` is set automatically by BaseError via this.constructor.name.
}
