/**
 * @fileoverview `validated()` — wrap a validator's `.parse` for use in a
 * binder (`bind: [payload(validated(Schema))]`) so a rejection becomes a
 * 400 (`RAPID_VALIDATION_FAILED`) instead of an opaque 500.
 *
 * WHEN YOU NEED IT: a `@tundralibs/guardian` schema does NOT need this —
 * `RapidError.from` already recognizes a guardian failure and 400s it
 * (with per-field detail). Reach for `validated()` for ANY OTHER validator
 * (zod, a hand-written `parse`, …): rapid treats an unrecognized throw as a
 * server error (500) by default, and this opts the throw into a 400.
 * Wrapping a guardian schema is harmless — the per-field detail is
 * preserved. A thrown `RapidError` always passes through untouched, so you
 * keep full control (e.g. a custom code/status) when you want it.
 *
 * @module
 */

import { asValidationError, RapidError } from '../errors/mod.ts';

/**
 * Wrap `schema.parse` so any rejection 400s. `this` is preserved (the
 * schema is called as a method), so passing a schema whose `parse` is an
 * unbound method is safe.
 */
export function validated<T>(
  schema: { parse: (value: unknown) => T },
): (value: unknown) => T {
  return (value: unknown): T => {
    try {
      return schema.parse(value);
    } catch (error) {
      if (error instanceof RapidError) throw error;
      // Guardian → rich per-field detail (via the shared recognizer);
      // any other validator → the thrown error's message.
      throw asValidationError(error) ??
        new RapidError('RAPID_VALIDATION_FAILED', {
          details: {
            message: error instanceof Error ? error.message : String(error),
          },
          cause: error instanceof Error ? error : undefined,
        });
    }
  };
}
