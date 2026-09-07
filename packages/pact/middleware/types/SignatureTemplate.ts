/**
 * @fileoverview {@link SignatureTemplate} — a compiled HMAC signing
 * template: the keys it names and a renderer over them.
 *
 * @module
 */

/** A compiled template; `render` substitutes each key in source order. */
export type SignatureTemplate = {
  readonly kind: 'request' | 'response';
  readonly source: string;
  readonly keys: readonly string[];
  render(value: (key: string) => string): string;
};
