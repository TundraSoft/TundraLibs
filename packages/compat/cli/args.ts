/**
 * @fileoverview CLI argument access and parsing.
 *
 * Two layers:
 *
 * - {@link args} — raw user-supplied tokens, runtime preamble stripped
 *   (Node's `argv[0]`/`argv[1]` are removed automatically).
 * - {@link argv} — Standard parser folding those tokens into an object
 *   with positional, flag, and repeated-flag handling.
 *
 * The parser is intentionally small: combined short flags (`-xyz`),
 * `--no-flag` negation, and `--` end-of-flags are *not* supported.
 * Reach for cliffy/yargs/commander when you need those.
 *
 * @module
 *
 * @example
 * ```ts
 * import { argv } from '@tundralibs/compat/cli';
 *
 * // Invoked as: deno run script.ts --port=8080 --inc a --inc b input.txt
 * const opts = argv();
 * // => { _: ['input.txt'], port: 8080, inc: ['a', 'b'] }
 * ```
 */

import { isBun, isDeno, isNode } from '../runtime.ts';

// deno-lint-ignore no-explicit-any
const g = globalThis as any;

export type ArgValue = string | number | boolean;

/**
 * Parsed CLI arguments. Positional tokens are collected into `_`;
 * named flags become own keys, with repeated flags collapsed into
 * arrays in insertion order.
 */
export type ParsedArgs = {
  _: string[];
  [key: string]: ArgValue | ArgValue[];
};

/**
 * User-supplied CLI tokens — `Deno.args` on Deno, `process.argv.slice(2)`
 * on Node/Bun, `[]` on unknown runtimes. Returns a fresh array on each
 * call.
 */
export const args = (): string[] => {
  /* c8 ignore start */
  if (isDeno) return [...g.Deno.args];
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) return g.process.argv.slice(2);
  /* c8 ignore stop */
  return [];
};

// Coerce only when the input string is a clean numeric literal — `'abc123'`
// or `'5px'` stay as strings.
const _coerceArg = (value: string): ArgValue => {
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return value;
};

const _setOrAppendArg = (
  out: ParsedArgs,
  key: string,
  value: ArgValue,
): void => {
  const existing = out[key];
  if (existing === undefined) {
    out[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    out[key] = [existing, value];
  }
};

// Peek at the next token. If it exists and doesn't look like a flag,
// it's the value for the current flag (`consumed: true`); otherwise
// the current flag is boolean.
const _consumeArgValue = (
  tokens: readonly string[],
  i: number,
): { value: ArgValue; consumed: boolean } => {
  const next = tokens[i + 1];
  if (next === undefined || (next.startsWith('-') && next.length > 1)) {
    return { value: true, consumed: false };
  }
  return { value: _coerceArg(next), consumed: true };
};

/**
 * Parses CLI arguments into a structured object.
 *
 * **Supported shapes:**
 * - `--name=value` and `--name value` → `{ name: 'value' }`
 * - `--flag` → `{ flag: true }`
 * - `-x` and `-x value` (single-char short flags only)
 * - Repeated flags become arrays: `--inc a --inc b` → `{ inc: ['a','b'] }`
 * - Numeric coercion when the value fully matches a number
 *   (`--port=5432` → `5432`; `--id=abc123` stays a string)
 * - Positional arguments collected into `_`
 *
 * **Not supported (out of scope for this parser):**
 * - Combined short flags (`-xyz`)
 * - `--no-flag` boolean negation
 * - `--` end-of-flags marker
 * - Negative numbers as positional (`-5` is parsed as `{ '5': true }`;
 *   pass them via `--key=-5` instead)
 *
 * @param input - Optional argument array; defaults to {@link args}()
 * @returns Parsed arguments
 *
 * @example
 * ```ts
 * argv(['--port=8080', '--inc', 'a', '--inc', 'b', 'input.txt'])
 * // => { _: ['input.txt'], port: 8080, inc: ['a', 'b'] }
 * ```
 */
export const argv = (input?: readonly string[]): ParsedArgs => {
  const tokens = input ?? args();
  const out: ParsedArgs = { _: [] };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;

    // Long flag with explicit `=value`: --name=value
    if (tok.startsWith('--') && tok.length > 2 && tok.includes('=')) {
      const eq = tok.indexOf('=');
      _setOrAppendArg(out, tok.slice(2, eq), _coerceArg(tok.slice(eq + 1)));
      continue;
    }

    // Any flag without `=`: --name [value] or -x [value]
    // Combined short flags (`-xyz`) intentionally fall through and are
    // recorded as a single key rather than expanded.
    if (tok.startsWith('-') && tok.length > 1 && tok !== '--') {
      const strip = tok.startsWith('--') ? 2 : 1;
      const { value, consumed } = _consumeArgValue(tokens, i);
      _setOrAppendArg(out, tok.slice(strip), value);
      if (consumed) i++;
      continue;
    }

    // Positional (also catches the bare `--` token)
    out._.push(tok);
  }

  return out;
};
