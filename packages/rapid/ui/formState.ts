/**
 * @fileoverview `formState()` — the validated-form round-trip, made a
 * primitive. Every form fragment ends up hand-rolling the same union —
 * an error arm carrying a message, per-field problems, and the values
 * to re-fill — and the same try/parse/extract dance to build it. This
 * runs the schema and hands back either the typed data or that
 * render-ready error arm, so the handler is two lines and the template
 * types its union as `RapidFormError | <its own success arms>`.
 *
 * @module
 */

import { asValidationError, RapidError } from '../errors/mod.ts';
import { isThenable } from '../utils/isThenable.ts';
import type { RapidFormError, RapidFormResult } from '../types/mod.ts';

/**
 * The re-fill values: the submission's top-level primitive fields,
 * stringified — exactly what `<input value="…">` can take back. Nested
 * objects, arrays, and file descriptors are dropped (never echo an
 * upload back into markup).
 */
const keptValues = (body: unknown): Record<string, string> => {
  const values: Record<string, string> = {};
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return values;
  }
  for (const [key, value] of Object.entries(body)) {
    if (
      typeof value === 'string' || typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      values[key] = String(value);
    }
  }
  return values;
};

/**
 * A parse failure → the error arm — RECOGNIZED validation failures only:
 * a guardian throw, or a `RAPID_VALIDATION_FAILED` (what `validated()`
 * mints for other validators). Anything else is a BUG in the validator,
 * not bad user input — it RETHROWS and 500s opaquely, per the package's
 * `validated()` policy, instead of shipping an internal exception
 * message into production HTML as a form error.
 */
const toError = (cause: unknown, body: unknown): RapidFormError => {
  const recognized = cause instanceof RapidError &&
      cause.code === 'RAPID_VALIDATION_FAILED'
    ? cause // a validated()-wrapped throw already carries the fields
    : asValidationError(cause);
  if (recognized === undefined) throw cause;
  const details = recognized.context.details as
    | { fields?: Record<string, string>; message?: unknown }
    | undefined;
  const fields = details?.fields ?? {
    '(root)': typeof details?.message === 'string'
      ? details.message
      : recognized.message,
  };
  return {
    state: 'error',
    message: Object.values(fields)[0] ?? 'Validation failed',
    fields: Object.freeze(fields),
    values: Object.freeze(keptValues(body)),
  };
};

/**
 * Validate one form submission against `schema` (anything with `.parse`
 * — a guardian schema as-is). Returns `{ ok: true, data }` on success;
 * on a RECOGNIZED validation failure, `{ ok: false, error }` with the
 * {@link RapidFormError} arm ready to hand to the form's template —
 * per-field messages extracted from a guardian failure, the submitted
 * top-level primitives kept as `values`. An UNRECOGNIZED throw (a bug
 * in a custom `parse`, not bad input) rethrows and 500s opaquely —
 * wrap another validator with `validated()` to opt its throws into the
 * error arm. Synchronous for a synchronous `parse`; a promise-returning
 * `parse` makes the result a promise — `await` it either way.
 *
 * @throws Whatever an unrecognized `parse` throw was (see above).
 *
 * @example
 * ```ts ignore
 * const form = await formState(CreatePostBody, body);
 * if (!form.ok) return { content: form.error }; // 200 — the union's own state
 * this._store.add(form.data);
 * return { content: { state: 'added' } };
 * ```
 */
export function formState<T>(
  schema: { parse(value: unknown): T | Promise<T> },
  body: unknown,
): RapidFormResult<T> | Promise<RapidFormResult<T>> {
  let parsed: T | Promise<T>;
  try {
    parsed = schema.parse(body);
  } catch (cause) {
    return { ok: false, error: toError(cause, body) };
  }
  if (isThenable(parsed)) {
    return parsed.then(
      (data): RapidFormResult<T> => ({ ok: true, data }),
      (cause): RapidFormResult<T> => ({
        ok: false,
        error: toError(cause, body),
      }),
    );
  }
  return { ok: true, data: parsed };
}
