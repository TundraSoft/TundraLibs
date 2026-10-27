/**
 * A non-text leaf of the message, or a text part the sender marked as an
 * attachment. `disposition` is `inline` for parts referenced from the
 * HTML by `cid:` (their `contentId` is set), `attachment` otherwise.
 */
export type MailAttachment = {
  filename?: string;
  /** `type/subtype`, lowercased. */
  contentType: string;
  disposition: 'attachment' | 'inline';
  contentId?: string;
  /** Byte length of `content`. */
  size: number;
  content: Uint8Array;
};
