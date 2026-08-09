/**
 * @fileoverview The active-span store — a dedicated `ambient` context holding
 * the span currently in scope.
 *
 * This is why `startSpan` needs no explicit parent: the active span travels
 * with the async flow (across every `await`, isolated between concurrent
 * requests), so a span created five frames deep automatically parents to the
 * one opened at the request boundary.
 *
 * It is deliberately a **separate** store from `ambient`'s `RequestContext`:
 * span lifecycle is tracer's concern, not part of the shared request bag.
 *
 * @author TundraSoft
 *
 * @module
 */

import { createContext } from '@tundralibs/ambient';
import type { Span } from './Span.ts';

/**
 * The currently active {@link Span}, or `undefined` outside any span scope.
 * Prefer `tracer.active()` — this is the underlying store.
 */
export const activeSpan: ReturnType<typeof createContext<Span>> = createContext<
  Span
>();
