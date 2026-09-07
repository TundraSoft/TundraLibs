/**
 * @fileoverview Per-request marks middlewares leave on the context object
 * for LATER readers in the same request — under symbols, never on
 * `ctx.state` (unsafe under `stateMode: 'SHARE'`). `session()` records the
 * session cookie it just issued so an OUTER `csrf()` can re-bind its token
 * on the same response; `csrf()` records the token valid for THIS response
 * so the view bag renders it (the request cookie is stale on the response
 * that mints or rotates it).
 *
 * @module
 */

/** The signed session-cookie value issued on this response; `''` on destroy. */
export const SESSION_ISSUED: unique symbol = Symbol('rapid.session.issued');
/** The csrf token valid for this response (issued or confirmed). */
export const CSRF_TOKEN: unique symbol = Symbol('rapid.csrf.token');

type Marks = { [SESSION_ISSUED]?: string; [CSRF_TOKEN]?: string };

/** Read a mark off the context (`undefined` when the middleware never ran). */
export const markOf = (
  ctx: object,
  key: typeof SESSION_ISSUED | typeof CSRF_TOKEN,
): string | undefined => (ctx as Marks)[key];

/** Leave a mark on the context. */
export const mark = (
  ctx: object,
  key: typeof SESSION_ISSUED | typeof CSRF_TOKEN,
  value: string,
): void => {
  (ctx as Marks)[key] = value;
};
