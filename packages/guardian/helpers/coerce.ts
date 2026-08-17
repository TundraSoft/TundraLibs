/**
 * @fileoverview Coercion helpers used by every primitive Guardian.
 *
 * Guardian is designed for API / DB boundaries where inputs commonly
 * arrive as strings (query params, form posts, JSON-from-CSV, env
 * vars, stringly-typed driver results). Each primitive guardian
 * coerces by default — `Guardian.number().parse('42')` returns `42`,
 * not a throw — so callers don't have to wrap every chain in a
 * `process(x => Number(x))` step that loses the validator-specific
 * methods (`.min()`, `.integer()`, etc.).
 *
 * The coercions are **deliberately strict** about what they accept.
 * `Boolean('false')` returning `true` (JS's native semantics) is a
 * well-known footgun, so `coerceBoolean` recognises a fixed set of
 * truthy/falsy strings and rejects anything else. Same idea for the
 * other types: silent NaN / silent garbage is a worse default than
 * a clear validation error.
 *
 * `null` and `undefined` are **not** coerced. They're rejected here,
 * but `BaseGuardian.optional()` and `.nullable()` intercept those
 * values upstream of the type validation — so an `.optional()` chain
 * still does what you'd expect.
 *
 * Coerce-by-default is right for *input parsing* (the API/DB boundary
 * this module targets) but wrong for *response validation* — a vendor
 * API returning `age: "42"` where the contract promises a number is a
 * schema violation you want to catch, not silently accept. There's no
 * single default that serves both: `NumberGuardian` / `BooleanGuardian`
 * bias toward the more common input-parsing case and expose `.strict()`
 * as the opt-out for the response-validation case (see {@link
 * NumberGuardian.strict} / {@link BooleanGuardian.strict}), rather than
 * flipping the default and forcing input-parsing callers to opt in.
 *
 * @module
 */

import { GuardianError } from '../errors/Base.ts';

/** Strings accepted as boolean `true` (case-insensitive, trimmed). */
const BOOL_TRUE = new Set(['true', '1', 'yes', 'y', 'on']);
/** Strings accepted as boolean `false` (case-insensitive, trimmed). */
const BOOL_FALSE = new Set(['false', '0', 'no', 'n', 'off', '']);

/**
 * Coerce arbitrary input to a `number`. Used as the first step of
 * `NumberGuardian`'s default transform.
 *
 * Accepts:
 * - `number` (NaN is rejected by the caller, not here)
 * - `string` — trimmed and parsed via `Number()`. Empty / NaN → throws.
 * - `bigint` — narrowing via `Number()`; precision loss for values
 *   above 2^53 is accepted.
 * - `boolean` — `true` → 1, `false` → 0.
 * - `Date` (valid) — `.getTime()` ms-since-epoch.
 *
 * Throws `GuardianError` for everything else (including `null`,
 * `undefined`, objects, arrays, symbols, functions).
 */
export const coerceNumber = (input: unknown): number => {
  if (typeof input === 'number') return input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed === '') {
      throw new GuardianError('Cannot coerce empty string to number', {
        expected: 'numeric string',
        got: input,
        comparison: 'coerce',
        type: 'number',
      });
    }
    const n = Number(trimmed);
    if (Number.isNaN(n)) {
      throw new GuardianError(`Cannot coerce "${input}" to number`, {
        expected: 'numeric string',
        got: input,
        comparison: 'coerce',
        type: 'number',
      });
    }
    return n;
  }
  if (typeof input === 'bigint') return Number(input);
  if (typeof input === 'boolean') return input ? 1 : 0;
  if (input instanceof Date) {
    const t = input.getTime();
    if (Number.isNaN(t)) {
      throw new GuardianError('Cannot coerce invalid Date to number', {
        expected: 'valid Date',
        got: 'invalid Date',
        comparison: 'coerce',
        type: 'number',
      });
    }
    return t;
  }
  throw new GuardianError(
    `Cannot coerce ${input === null ? 'null' : typeof input} to number`,
    {
      expected: 'number-coercible value',
      got: input === null ? 'null' : typeof input,
      comparison: 'coerce',
      type: 'number',
    },
  );
};

/**
 * Coerce arbitrary input to a `string`.
 *
 * Accepts:
 * - `string`
 * - `number` (not NaN) — via `String()`.
 * - `bigint` — via `String()`.
 * - `boolean` — `'true'` / `'false'`.
 * - `Date` (valid) — ISO 8601 string.
 *
 * Throws for `null`, `undefined`, objects, arrays, symbols, functions
 * and invalid dates. `[object Object]` is rarely what an API caller
 * meant to send, so we don't silently produce it.
 */
export const coerceString = (input: unknown): string => {
  if (typeof input === 'string') return input;
  if (typeof input === 'number') {
    if (Number.isNaN(input)) {
      throw new GuardianError('Cannot coerce NaN to string', {
        expected: 'finite number',
        got: 'NaN',
        comparison: 'coerce',
        type: 'string',
      });
    }
    return String(input);
  }
  if (typeof input === 'bigint') return String(input);
  if (typeof input === 'boolean') return input ? 'true' : 'false';
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new GuardianError('Cannot coerce invalid Date to string', {
        expected: 'valid Date',
        got: 'invalid Date',
        comparison: 'coerce',
        type: 'string',
      });
    }
    return input.toISOString();
  }
  throw new GuardianError(
    `Cannot coerce ${input === null ? 'null' : typeof input} to string`,
    {
      expected: 'string-coercible value',
      got: input === null ? 'null' : typeof input,
      comparison: 'coerce',
      type: 'string',
    },
  );
};

/**
 * Coerce arbitrary input to a `boolean`.
 *
 * **Strict string list** to avoid JS's `Boolean('false') === true`
 * footgun:
 *
 * - `boolean` → as-is.
 * - `string` (trimmed, lower-cased):
 *   - `'true' | '1' | 'yes' | 'y' | 'on'` → `true`
 *   - `'false' | '0' | 'no' | 'n' | 'off' | ''` → `false`
 *   - anything else → throws.
 * - `number`: only `0` → `false`, `1` → `true`. Other numbers throw
 *   (no silent truthification of `42`).
 *
 * Everything else (null, undefined, bigint, Date, objects, …) throws.
 */
export const coerceBoolean = (input: unknown): boolean => {
  if (typeof input === 'boolean') return input;
  if (typeof input === 'string') {
    const v = input.trim().toLowerCase();
    if (BOOL_TRUE.has(v)) return true;
    if (BOOL_FALSE.has(v)) return false;
    throw new GuardianError(
      `Cannot coerce "${input}" to boolean (accepted: true/false/yes/no/y/n/on/off/1/0)`,
      {
        expected: 'boolean-like string',
        got: input,
        comparison: 'coerce',
        type: 'boolean',
      },
    );
  }
  if (typeof input === 'number') {
    if (input === 1) return true;
    if (input === 0) return false;
    throw new GuardianError(
      `Cannot coerce number ${input} to boolean (only 0/1 accepted)`,
      {
        expected: '0 or 1',
        got: input,
        comparison: 'coerce',
        type: 'boolean',
      },
    );
  }
  throw new GuardianError(
    `Cannot coerce ${input === null ? 'null' : typeof input} to boolean`,
    {
      expected: 'boolean-coercible value',
      got: input === null ? 'null' : typeof input,
      comparison: 'coerce',
      type: 'boolean',
    },
  );
};

/**
 * Coerce arbitrary input to a `Date`.
 *
 * Accepts:
 * - `Date` (valid) — as-is.
 * - `number` — interpreted as ms-since-epoch.
 * - `string` — parsed by `new Date(string)`; rejects if the result
 *   is invalid (NaN time).
 * - `bigint` — narrowed via `Number()` then treated as ms.
 *
 * Throws for `null`, `undefined`, `boolean`, objects, arrays and
 * invalid date strings.
 */
export const coerceDate = (input: unknown): Date => {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      throw new GuardianError('Date is invalid', {
        expected: 'valid Date',
        got: 'invalid Date',
        comparison: 'validity',
        type: 'date',
      });
    }
    return input;
  }
  if (typeof input === 'number' || typeof input === 'bigint') {
    const ms = typeof input === 'bigint' ? Number(input) : input;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) {
      throw new GuardianError(`Cannot coerce ${input} to Date`, {
        expected: 'valid ms-since-epoch',
        got: input,
        comparison: 'coerce',
        type: 'date',
      });
    }
    return d;
  }
  if (typeof input === 'string') {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) {
      throw new GuardianError(`Cannot coerce "${input}" to Date`, {
        expected: 'ISO 8601 / RFC 2822 / parseable date string',
        got: input,
        comparison: 'coerce',
        type: 'date',
      });
    }
    return d;
  }
  throw new GuardianError(
    `Cannot coerce ${input === null ? 'null' : typeof input} to Date`,
    {
      expected: 'Date-coercible value',
      got: input === null ? 'null' : typeof input,
      comparison: 'coerce',
      type: 'date',
    },
  );
};

/**
 * Coerce arbitrary input to a `bigint`.
 *
 * Accepts:
 * - `bigint`
 * - `number` (integer only) — non-integers throw (lossy conversion
 *   is the kind of silent footgun we're trying to avoid).
 * - `string` (trimmed) — via `BigInt()`; syntax errors throw a
 *   `GuardianError` instead of bubbling the raw `SyntaxError`.
 * - `boolean` — `true` → `1n`, `false` → `0n`.
 *
 * Throws for `null`, `undefined`, `Date`, objects.
 */
export const coerceBigInt = (input: unknown): bigint => {
  if (typeof input === 'bigint') return input;
  if (typeof input === 'number') {
    if (!Number.isInteger(input)) {
      throw new GuardianError(
        `Cannot coerce non-integer ${input} to bigint`,
        {
          expected: 'integer',
          got: input,
          comparison: 'coerce',
          type: 'bigint',
        },
      );
    }
    return BigInt(input);
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed === '') {
      throw new GuardianError('Cannot coerce empty string to bigint', {
        expected: 'integer string',
        got: input,
        comparison: 'coerce',
        type: 'bigint',
      });
    }
    try {
      return BigInt(trimmed);
    } catch {
      throw new GuardianError(`Cannot coerce "${input}" to bigint`, {
        expected: 'integer string',
        got: input,
        comparison: 'coerce',
        type: 'bigint',
      });
    }
  }
  if (typeof input === 'boolean') return input ? 1n : 0n;
  throw new GuardianError(
    `Cannot coerce ${input === null ? 'null' : typeof input} to bigint`,
    {
      expected: 'bigint-coercible value',
      got: input === null ? 'null' : typeof input,
      comparison: 'coerce',
      type: 'bigint',
    },
  );
};
