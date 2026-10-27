import type { MailContentType } from './MailContentType.ts';
import type { MailHeader } from './MailHeader.ts';
import type { MailMessage } from './MailMessage.ts';

/**
 * One node of the MIME tree. The root part is the message itself; a
 * `multipart/*` part carries its children and an empty `content`; a
 * `message/rfc822` part carries the parsed inner message in `message` as
 * well as its raw bytes in `content`.
 */
export type MailPart = {
  headers: MailHeader[];
  contentType: MailContentType;
  /** `Content-Transfer-Encoding`, lowercased; `7bit` when absent. */
  encoding: string;
  /** `Content-Disposition` type, lowercased (`attachment`, `inline`), when sent. */
  disposition?: string;
  /** From `Content-Disposition` `filename`, else `Content-Type` `name`. */
  filename?: string;
  /** `Content-ID` without its angle brackets. */
  contentId?: string;
  /** The declared charset of a `text/*` part, lowercased. */
  charset?: string;
  /** The body after transfer decoding. Empty for a multipart. */
  content: Uint8Array;
  /** `content` decoded as text, for `text/*` parts only. */
  text?: string;
  children: MailPart[];
  message?: MailMessage;
};
