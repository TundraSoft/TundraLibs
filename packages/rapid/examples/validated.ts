/**
 * Bridge guardian validation into rAPId's error taxonomy. Framework
 * design (packages/rapid/DESIGN-modules.md): a module MAY opt into
 * `RapidError` for proper classification; a PLAIN thrown error is treated
 * as an opaque 500 by default (the safe default — modules stay
 * framework-blind otherwise). A bare `Schema.parse` throws a
 * `GuardianError`, not a `RapidError`, so without this it 500s instead of
 * 400ing — this wraps any guardian schema's `.parse` into the
 * `payload()`/`param()` binder shape, translating a rejection into
 * `RAPID_VALIDATION_FAILED` with per-field detail from `leafErrors()`.
 *
 * @module
 */

import { GuardianError } from '@tundralibs/guardian';
import { RapidError } from '../errors/mod.ts';

/** Wrap a guardian schema's `.parse` so a rejection 400s (not 500s). */
export function validated<T>(schema: { parse: (value: unknown) => T }) {
  return (value: unknown): T => {
    try {
      return schema.parse(value);
    } catch (error) {
      if (error instanceof GuardianError) {
        const fields = Object.fromEntries(
          [...error.leafErrors()].map((
            { path, error: leaf },
          ) => [path.join('.') || '(root)', leaf.message]),
        );
        throw new RapidError('RAPID_VALIDATION_FAILED', {
          details: { fields },
        });
      }
      throw error;
    }
  };
}
