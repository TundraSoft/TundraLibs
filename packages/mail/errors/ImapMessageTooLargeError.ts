/**
 * @fileoverview {@link ImapMessageTooLargeError} — a fetched body exceeded `maxSize`.
 *
 * @module
 */

import { MailError } from './Base.ts';

/**
 * Thrown by `ImapClient.fetch()` when a message body or header literal is
 * larger than the `maxSize` in force. The bytes beyond the limit were read
 * off the socket and discarded, so the connection stays usable; fetch the
 * header alone, or raise `maxSize`, and try again.
 */
export class ImapMessageTooLargeError extends MailError<{
  uid: number;
  size: number;
  maxSize: number;
}> {
  constructor(uid: number, size: number, maxSize: number) {
    super(
      'IMAP message UID ${uid} is ${size} bytes, over the ${maxSize} byte limit',
      { uid, size, maxSize },
    );
  }
}
