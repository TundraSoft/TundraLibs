/**
 * @fileoverview {@link ImapParseError} — a server line the client could not read.
 *
 * @module
 */

import { MailError } from './Base.ts';

/**
 * Thrown when a response line does not follow the IMAP grammar the client
 * understands: an unbalanced list, a tag it never sent, a literal
 * announcement with no size. `context.line` is the offending line, with
 * literal contents replaced by their `{n}` announcement.
 */
export class ImapParseError
  extends MailError<{ reason: string; line: string }> {
  constructor(reason: string, line: string) {
    super('IMAP response could not be parsed (${reason}): ${line}', {
      reason,
      line,
    });
  }
}
