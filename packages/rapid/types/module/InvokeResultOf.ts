/**
 * @fileoverview {@link RapidModuleInvokeResultOf} — the typed envelope
 * `invoke` resolves to for a method returning `R`: a `reply(status, c)`
 * keeps `c`'s type; `void` is a 204 with `null`; anything else is the
 * value under 200.
 *
 * @module
 */

import type { Reply } from '../../modules/reply.ts';
import type { RapidModuleInvokeResult } from './InvokeResult.ts';

/** Envelope type for a method whose return type is `R`. */
export type RapidModuleInvokeResultOf<R> = [Awaited<R>] extends [Reply<infer C>]
  ? RapidModuleInvokeResult<C>
  : [Awaited<R>] extends [void] ? RapidModuleInvokeResult<null>
  : RapidModuleInvokeResult<Awaited<R>>;
