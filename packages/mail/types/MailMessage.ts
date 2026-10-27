import type { MailAddress } from './MailAddress.ts';
import type { MailAttachment } from './MailAttachment.ts';
import type { MailHeader } from './MailHeader.ts';
import type { MailPart } from './MailPart.ts';

/**
 * A parsed RFC 5322 message. Address lists are empty, never undefined,
 * when the header is absent; `text` and `html` are the first
 * `text/plain` and `text/html` body parts found outside attachments, kept
 * exactly as sent (the HTML is not sanitised; never render it as is).
 */
export type MailMessage = {
  headers: MailHeader[];
  subject?: string;
  from: MailAddress[];
  sender?: MailAddress;
  replyTo: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  /** `Date`, when present and parseable. */
  date?: Date;
  /** `Message-ID` without angle brackets. */
  messageId?: string;
  /** Ids from `In-Reply-To`, without angle brackets. */
  inReplyTo: string[];
  /** Ids from `References`, without angle brackets, in header order. */
  references: string[];
  text?: string;
  html?: string;
  attachments: MailAttachment[];
  /** `Auto-Submitted` (RFC 3834), lowercased: `no`, `auto-replied`, `auto-generated`, … */
  autoSubmitted?: string;
  /** `Precedence`, lowercased: `bulk`, `list`, `junk`, `auto_reply`, … */
  precedence?: string;
  /** `List-Id` as sent. */
  listId?: string;
  /** `X-Autoreply` / `X-Auto-Response-Suppress`-style marker as sent. */
  xAutoreply?: string;
  /** The MIME tree, for callers that need more than the flattened view. */
  root: MailPart;
};
