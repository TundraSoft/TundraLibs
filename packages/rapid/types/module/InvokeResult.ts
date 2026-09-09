/**
 * @fileoverview {@link RapidModuleInvokeResult} — what `invoke` resolves
 * to: an envelope, never a throw out of the invocation. A denied guard,
 * a thrown error and a normal return all arrive in this shape (see
 * `reply()` to set a status explicitly).
 *
 * @module
 */

import type { StatusCode } from '@tundralibs/compat/http';

/** The invocation outcome envelope. */
export type RapidModuleInvokeResult<T = unknown> = {
  readonly status: StatusCode;
  readonly content: T;
};
