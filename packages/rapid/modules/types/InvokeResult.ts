/**
 * @fileoverview {@link RapidModuleInvokeResult} — what `invoke` hands
 * back: an envelope, never a throw. A denied guard, a thrown error and
 * a normal return all arrive in the same shape.
 *
 * @module
 */

import type { StatusCode } from '@tundralibs/compat/http';

/** The invocation outcome envelope. */
export type RapidModuleInvokeResult<T = unknown> = {
  status: StatusCode;
  content: T;
};
