/**
 * @fileoverview The swap decision — shared by the representer and
 * `ctx.isSwap`, kept out of `ui/` so the context never imports the
 * representer.
 *
 * @module
 */

import type { HTTPContext } from '../context/HTTPContext.ts';
import type { RapidContextState } from '../types/mod.ts';

/** The UI-options slice {@link isSwap} reads. */
export type SwapOptions = {
  readonly swapHeader?: string;
  readonly swapUnless?: readonly string[];
};

/**
 * Whether this request asked for the FRAGMENT: the swap header is
 * present AND none of the `swapUnless` headers are — the escape needed
 * by clients (htmx) that send their marker on full-page navigations
 * too (`HX-Boosted`, history restores). Surface-blind: callers gate on
 * `ctx.surface` themselves.
 */
export function isSwap<S extends RapidContextState>(
  ctx: HTTPContext<S>,
  appUi: SwapOptions | undefined = ctx.app.uiOptions,
): boolean {
  if (ctx.headers.get(appUi?.swapHeader ?? 'rapid-swap') === null) {
    return false;
  }
  for (const name of appUi?.swapUnless ?? []) {
    if (ctx.headers.get(name) !== null) return false;
  }
  return true;
}
