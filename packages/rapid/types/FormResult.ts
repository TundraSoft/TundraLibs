/**
 * @fileoverview {@link RapidFormResult} — what `formState()` hands back:
 * typed data, or the render-ready error state.
 *
 * @module
 */

import type { RapidFormError } from './FormError.ts';

/**
 * The outcome of validating one form submission: `ok` with the schema's
 * typed value, or the {@link RapidFormError} the form template renders
 * as its error arm.
 */
export type RapidFormResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: RapidFormError };
