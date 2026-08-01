/**
 * @fileoverview {@link MalformedPathError} — thrown when a path
 * passed to {@link RadRouter.addRoute} contains a syntactically
 * invalid segment. Covers both invalid parameter names and
 * segments that contain `:` but don't match one of the four
 * supported pattern forms. The thrown instance carries the
 * offending segment (and parameter name, when applicable) on
 * `error.context` so callers can surface the exact failure to
 * developers.
 *
 * @module
 */

import { RadRouterError } from './Base.ts';

/** Metadata attached to a {@link MalformedPathError}. */
export type MalformedPathErrorMeta = {
  /** The offending segment in its original form. */
  segment: string;
  /** Set when the failure was an invalid `:name:` identifier; the bad name. */
  paramName?: string;
};

/**
 * Thrown when a route registration's path can't be parsed. The
 * shape of `error.context` distinguishes between an invalid
 * `:name:` token (carries `paramName`) and a wholly malformed
 * segment (just `segment`).
 *
 * @example
 * ```ts
 * try {
 *   router.get('/users/:1bad:', [mw]);
 * } catch (e) {
 *   if (e instanceof MalformedPathError) {
 *     console.error('Bad path:', e.context.segment);
 *   }
 * }
 * ```
 */
export class MalformedPathError extends RadRouterError<MalformedPathErrorMeta> {
  constructor(message: string, meta: MalformedPathErrorMeta, cause?: Error) {
    super(message, meta, cause);
  }
}
