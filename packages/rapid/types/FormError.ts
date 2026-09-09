/**
 * @fileoverview {@link RapidFormError} — the error arm of the validated-form
 * union, as `formState()` builds it.
 *
 * @module
 */

/**
 * A form submission's validation-error state — rendered by the form's
 * OWN template as a 200 (recoverable input problems are state, not
 * failures): a summary `message`, per-field messages under `fields`
 * (dot-joined paths; `(root)` for a non-field failure), and the
 * submitted `values` so inputs re-fill instead of clearing.
 */
export type RapidFormError = {
  readonly state: 'error';
  readonly message: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly values: Readonly<Record<string, string>>;
};
