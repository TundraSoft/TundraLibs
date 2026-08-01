/**
 * Captured path parameters from a successful route lookup. Keys
 * are parameter names (the `:name:` form in the registered path);
 * values are the matched URL slice with the request's original
 * case preserved.
 *
 * At runtime this is a **null-prototype** object (`Object.create(null)`),
 * not a plain `{}`. Param names may collide with `Object.prototype`
 * members (`constructor`, `hasOwnProperty`, `__proto__`, … — all valid
 * under `[A-Za-z_]\w*`), and a null prototype keeps every capture a plain
 * own string entry rather than shadowing a builtin. As a consequence the
 * object inherits **no** `Object.prototype` methods, so `p.hasOwnProperty`,
 * `p.toString()`, `String(p)`, and `` `${p}` `` throw `TypeError` and
 * `p.constructor` is `undefined`. Treat it as data: index access
 * (`p.id`), `k in p`, `Object.keys(p)`, `JSON.stringify(p)`, and
 * `Object.prototype.hasOwnProperty.call(p, k)` all work as expected.
 */
export type RouteParams = { [key: string]: string };
