/**
 * @fileoverview `Reply` / `reply()` — the EXPLICIT invocation envelope.
 * `invoke` never guesses whether a returned object "looks like" an
 * envelope: a method that wants to set a status returns `reply(status,
 * content)`; anything else is content under 200; `undefined` is 204.
 * The runtime's own results are `Reply` instances too, so a nested
 * invoke's outcome passes through by identity.
 *
 * @module
 */

import type { StatusCode } from '@tundralibs/compat/http';
import type { RapidModuleInvokeResult } from '../types/mod.ts';

/** The envelope `invoke` resolves to. Construct with {@link reply}. */
export class Reply<C = unknown> implements RapidModuleInvokeResult<C> {
  /** Build an envelope directly; prefer the {@link reply} factory. */
  constructor(
    /** The invocation outcome status. */
    public readonly status: StatusCode,
    /** The envelope body. */
    public readonly content: C,
  ) {}
}

/** Build an explicit envelope: `return reply(403, { reason })`. */
export const reply = <C>(status: StatusCode, content: C): Reply<C> =>
  new Reply(status, content);
