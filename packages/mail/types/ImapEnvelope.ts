import type { MailAddress } from './MailAddress.ts';

/**
 * The server-parsed ENVELOPE of a message. `date` is the raw Date header
 * text; `subject` has RFC 2047 encoded words decoded. Address lists are
 * empty when the header was NIL.
 */
export type ImapEnvelope = {
  date?: string;
  subject?: string;
  from: MailAddress[];
  sender: MailAddress[];
  replyTo: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  /** Raw `In-Reply-To` text, angle brackets included. */
  inReplyTo?: string;
  /** `Message-ID` without angle brackets. */
  messageId?: string;
};
