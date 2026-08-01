/**
 * @fileoverview `templatize(str, opts?)` — compile a `${var}` template
 * into a fast type-safe renderer. Compiles once, renders many.
 *
 * - **Type-level extraction** of variable names from string literals,
 *   so callers get autocomplete and missing-key errors at compile time.
 * - **Dot-path lookup**: `${user.name}` walks `values.user.name` *and*
 *   accepts the flat-key form `{'user.name': 'x'}` for back-compat.
 * - **Array values** render as `(a, b, c)` (matches the legacy
 *   `variableReplacer` contract).
 * - **`Date`** values render as an ISO 8601 string (`toISOString()`),
 *   **`RegExp`** as its literal form (`toString()`), and **function**
 *   values as their source (`toString()`).
 * - **Plain objects** render via `JSON.stringify`.
 * - **Missing keys** behave per `onMissing`: `'empty'` (default) emits
 *   `''`; `'literal'` keeps the `${var}` text. Choose `'literal'` when
 *   the template will be tailed by a human (logs); `'empty'` for
 *   user-facing rendering (messages, URLs).
 *
 * @module
 */

/**
 * Extract `${var}` names from a template string literal as a union.
 *
 * @typeParam T - Template string literal.
 *
 * @example
 * ```typescript
 * type V = ExtractVariableNames<'Hi ${name}, ${day}'>; // 'name' | 'day'
 * ```
 */
type ExtractVariableNames<T extends string> = T extends
  `${infer _Start}\${${infer Var}}${infer Rest}`
  ? Var | ExtractVariableNames<Rest>
  : never;

/**
 * Object shape required to render a template — one string-typed key
 * per `${var}` in the template.
 *
 * @typeParam T - Template string literal.
 */
type TemplateValues<T extends string> = {
  [K in ExtractVariableNames<T>]: string;
};

/**
 * Options for {@link templatize}.
 */
export type TemplateOptions = {
  /**
   * Behaviour when a `${var}` references a key that's missing /
   * `undefined` on the values object.
   *
   * - `'empty'` (default): emit `''`. Use for user-facing rendering
   *   (URLs, messages) where leftover `${...}` text would leak.
   * - `'literal'`: keep the original `${var}` text. Use for log
   *   templates where humans tail the output and seeing the missing
   *   variable name is useful.
   */
  onMissing?: 'empty' | 'literal';
};

/** Pre-parsed template token — literal chunk or `${path}` lookup. @internal */
type Token = string | { readonly lookup: string };

/**
 * Parse a `${var}`-style template into literal + lookup tokens. Done
 * once at construction time so render() doesn't pay parse cost per call.
 *
 * @internal
 */
const _parse = (template: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < template.length) {
    const start = template.indexOf('${', i);
    if (start === -1) {
      if (i < template.length) tokens.push(template.slice(i));
      break;
    }
    if (start > i) tokens.push(template.slice(i, start));
    const end = template.indexOf('}', start + 2);
    if (end === -1) {
      // Unterminated `${`; keep it (and everything after) as a literal.
      tokens.push(template.slice(start));
      break;
    }
    tokens.push({ lookup: template.slice(start + 2, end) });
    i = end + 1;
  }
  return tokens;
};

/**
 * Path segments that reach the prototype chain rather than own data.
 * Resolving these would let a `${...}` placeholder probe internals
 * (`${constructor.name}`) or read prototype-polluted values
 * (`${__proto__.x}`), so they're rejected outright. @internal
 */
const _FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Look up a key on the values object. Tries flat key first (back-compat
 * with `'user.name'`-as-literal-key callers), then walks the dot path.
 *
 * Lookups are restricted to **own** properties (`Object.hasOwn`) and
 * reject prototype-chain keys (`__proto__` / `constructor` /
 * `prototype`). This keeps placeholders from resolving against inherited
 * members — `${toString}`, `${constructor}` — or being used to
 * exfiltrate data via the prototype chain when a template is fed
 * untrusted input.
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
 * Stringify a looked-up value for substitution. Matches the legacy
 * `variableReplacer` contract.
 *
 * @internal
 */
const _stringify = (
  value: unknown,
  lookupKey: string,
  onMissing: 'empty' | 'literal',
): string => {
  if (value === undefined) {
    return onMissing === 'literal' ? `\${${lookupKey}}` : '';
  }
  if (Array.isArray(value)) {
    // Default-stringify on elements is intentional for parity with
    // the legacy `variableReplacer` output. NOSONAR
    return '(' + value.join(', ') + ')'; // NOSONAR
  }
  if (value === null) return 'null';
  // Functions render as their source (`(x) => x + 1`). Useful for
  // logging callbacks / formatters by reference in error messages.
  if (typeof value === 'function') return value.toString();
  if (typeof value === 'object') {
    // Common instance types get a meaningful string form rather than
    // JSON-stringifying (which yields `{}` for RegExp and similar
    // for class instances without enumerable own props).
    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return value.toString();
    return JSON.stringify(value);
  }
  return String(value);
};

/**
 * Compile `template` into a renderer. Compile cost is paid once; the
 * returned function performs a small loop of literal-append +
 * dot-path lookup per call (no regex, no object flatten).
 *
 * @typeParam T - Template literal (inferred from the call site).
 * @param template - String containing `${var}` placeholders.
 * @param options - See {@link TemplateOptions}. Defaults to
 *   `{ onMissing: 'empty' }`.
 * @returns Renderer accepting the inferred values object.
 *
 * @example Static template with type-checked values
 * ```typescript
 * const greet = templatize('Hello, ${name}!');
 * greet({ name: 'Alice' });  // 'Hello, Alice!'
 * ```
 *
 * @example Log-style template — preserve placeholders on missing keys
 * ```typescript
 * const log = templatize('[${time}] ${level}: ${msg}', { onMissing: 'literal' });
 * log({ time: '12:00', msg: 'hi' });  // '[12:00] ${level}: hi'
 * ```
 *
 * @example Dot-path lookup against nested values
 * ```typescript
 * const fmt = templatize('User: ${user.name}');
 * // Both forms work at runtime:
 * fmt({ 'user.name': 'Bob' });            // flat key
 * fmt({ user: { name: 'Bob' } } as any);  // nested
 * ```
 */
export const templatize = <T extends string>(
  template: T,
  options?: TemplateOptions,
): (values: TemplateValues<T>) => string => {
  const onMissing = options?.onMissing ?? 'empty';
  const tokens = _parse(template);

  // All-literal template — return a constant function.
  if (tokens.every((t) => typeof t === 'string')) {
    const constant = tokens.join('');
    return () => constant;
  }

  // Single token (one lookup, no literal) — skip the loop.
  if (tokens.length === 1) {
    const tok = tokens[0] as { lookup: string };
    return (values: TemplateValues<T>): string =>
      _stringify(_lookup(values, tok.lookup), tok.lookup, onMissing);
  }

  return (values: TemplateValues<T>): string => {
    let out = '';
    for (const tok of tokens) {
      if (typeof tok === 'string') {
        out += tok;
      } else {
        out += _stringify(_lookup(values, tok.lookup), tok.lookup, onMissing);
      }
    }
    return out;
  };
};
