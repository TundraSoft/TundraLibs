/**
 * @fileoverview One-shot template substitution for cases where the
 * template string itself is dynamic (loaded from config, computed at
 * call site, etc.).
 *
 * For default `${...}` delimiters this delegates to
 * {@link templatize} — same engine, same semantics, same speed.
 *
 * For non-standard delimiters (e.g. handlebars `{{...}}`, shell-style
 * `$VAR`) pass a custom regex with a single capture group around the
 * variable name. That path uses a hand-rolled scanner with the same
 * dot-path / array / null contract as templatize.
 *
 * For static templates known at module-load time, use
 * {@link templatize} directly and reuse the returned renderer — that
 * pays the compile cost once instead of once per call.
 *
 * @module
 */
import { templatize } from './templatize.ts';

/**
 * Path segments that reach the prototype chain rather than own data;
 * rejected so a placeholder can't probe internals or read
 * prototype-polluted values. Mirrors the guard in {@link templatize}.
 * @internal
 */
const _FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Look up a key on the values object. Tries flat key first (back-compat
 * with `'user.name'`-as-literal-key callers), then walks the dot path.
 *
 * Restricted to **own** properties (`Object.hasOwn`) and rejects
 * prototype-chain keys (`__proto__` / `constructor` / `prototype`) so a
 * custom-delimiter template fed untrusted input can't resolve inherited
 * members or exfiltrate via the prototype chain.
 *
 * @internal
 */
// deno-lint-ignore no-explicit-any
const _lookup = (obj: any, path: string): unknown => {
  if (obj == null) return undefined;
  if (Object.hasOwn(obj, path)) return obj[path];
  if (!path.includes('.')) return undefined;
  const parts = path.split('.');
  // deno-lint-ignore no-explicit-any
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    if (_FORBIDDEN_KEYS.has(p) || !Object.hasOwn(cur, p)) return undefined;
    cur = cur[p];
  }
  return cur;
};

/**
 * Stringify a looked-up value for substitution. Matches the
 * {@link templatize} `onMissing: 'literal'` contract.
 *
 * @internal
 */
const _stringify = (
  value: unknown,
  fullPlaceholder: string,
): string => {
  if (value === undefined) return fullPlaceholder;
  if (Array.isArray(value)) {
    // Element default-stringification matches the legacy contract. NOSONAR
    return '(' + value.join(', ') + ')'; // NOSONAR
  }
  if (value === null) return 'null';
  // Functions render as their source. Same contract as templatize.
  if (typeof value === 'function') return value.toString();
  if (typeof value === 'object') {
    // Date + RegExp get meaningful string forms (`toISOString()` and
    // the literal syntax respectively); other objects JSON-stringify.
    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return value.toString();
    return JSON.stringify(value);
  }
  return String(value);
};

/**
 * Substitute placeholders in `message` with values from `context`.
 *
 * - Default delimiters are `${...}` — under the hood this delegates
 *   to {@link templatize} with `onMissing: 'literal'`.
 * - Pass `regex` to use non-standard delimiters. The regex MUST be
 *   global (`/g` flag) and have **exactly one capture group** around
 *   the variable name. Common patterns:
 *   - Handlebars `{{name}}` → `/\{\{([^}]+)\}\}/g`
 *   - Shell-style `$NAME` → `/\$([A-Z_][A-Z0-9_]*)/g`
 *   - Angular-style `[[name]]` → `/\[\[([^\]]+)\]\]/g`
 *
 * Nested values are reachable via dot paths (`${user.name}`), arrays
 * render as `(a, b, c)`, unknown keys keep their placeholder, and
 * circular plain-object values throw on stringify.
 *
 * @param message - Template containing placeholders.
 * @param context - Source values (object trees walked via dot paths).
 * @param regex - Optional custom placeholder pattern. Must be global
 *   and have one capture group around the variable name. Defaults to
 *   the `${...}` form handled by {@link templatize}.
 * @returns `message` with placeholders substituted.
 *
 * @throws {TypeError} If a substituted plain-object value participates
 *   in a circular reference graph (raised by JSON.stringify).
 *
 * @example Standard `${}` delimiters
 * ```typescript
 * variableReplacer(
 *   'User ${user.name}: ${tags}',
 *   { user: { name: 'Ada' }, tags: ['admin', 'beta'] },
 * );
 * // 'User Ada: (admin, beta)'
 * ```
 *
 * @example Custom delimiters (handlebars-style)
 * ```typescript
 * variableReplacer(
 *   'Hello {{name}}!',
 *   { name: 'World' },
 *   /\{\{([^}]+)\}\}/g,
 * );
 * // 'Hello World!'
 * ```
 */
export const variableReplacer = (
  message: string,
  context: Record<string, unknown>,
  regex?: RegExp,
): string => {
  // Fast path: default `${...}` form delegates to templatize.
  if (regex === undefined) {
    return templatize(message, { onMissing: 'literal' })(
      context as Record<string, never>,
    );
  }

  // Custom-delimiter path: same value-stringification rules, but
  // dispatched by regex so any single-capture-group pattern works.
  return message.replace(regex, (match, key: string) => {
    const value = _lookup(context, key);
    return _stringify(value, match);
  });
};
