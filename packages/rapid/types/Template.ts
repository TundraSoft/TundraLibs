/**
 * @fileoverview {@link RapidTemplate} — a route's HTML template: a named,
 * pure render function over the handler's data.
 *
 * @module
 */

import type { Html } from '../ui/html.ts';
import type { RapidView } from './View.ts';

/**
 * A template: pure `(data, view) => Html`, declared via the `template()`
 * factory. `render` uses METHOD syntax deliberately — method bivariance
 * lets a `RapidTemplate<UsersResult>` be accepted where a route option is
 * typed `RapidTemplate<unknown>`, which a function-typed property would
 * reject under strict function types.
 *
 * The route option cannot statically prove the handler's `content`
 * matches `D` (the reply envelope's `content` is a union); a mismatch
 * surfaces as the template reading `undefined` fields. Templates are
 * pure, so `render(MyTemplate.render(handlerResult, view))` in a unit
 * test pins the pairing.
 *
 * @typeParam D - the data shape the template renders.
 */
export type RapidTemplate<D = unknown> = {
  /** Diagnostic name; `''` falls back to the route path in errors. */
  readonly name: string;
  render(data: D, view: RapidView): Html;
};
