/**
 * A parsed `Content-Type`. `type` and `subtype` are lowercased
 * (`text`/`plain`); `params` keys are lowercased and RFC 2231
 * continuations and charset-encoded values are already joined and
 * decoded.
 */
export type MailContentType = {
  type: string;
  subtype: string;
  params: Record<string, string>;
};
