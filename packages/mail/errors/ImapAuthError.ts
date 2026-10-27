/**
 * @fileoverview {@link ImapAuthError} — the server refused the credentials.
 *
 * @module
 */

import { MailError } from './Base.ts';

/**
 * Thrown by `ImapClient.connect()` when LOGIN or AUTHENTICATE is answered
 * with NO or BAD, or when the server advertises LOGINDISABLED and offers
 * no other mechanism the client speaks. `context.text` carries the
 * server's own words.
 */
export class ImapAuthError extends MailError<{
  hostname: string;
  user: string;
  text: string;
}> {
  constructor(hostname: string, user: string, text: string) {
    super('IMAP authentication failed for ${user}@${hostname}: ${text}', {
      hostname,
      user,
      text,
    });
  }
}
