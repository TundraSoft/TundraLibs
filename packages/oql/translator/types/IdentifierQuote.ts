/**
 * Identifier-quoting style. `escape` is the sequence used to quote
 * a literal occurrence of `close` inside an identifier (typically
 * `close + close`, e.g. `"` → `""`).
 */
export type IdentifierQuote = {
  open: string;
  close: string;
  escape: string;
};
