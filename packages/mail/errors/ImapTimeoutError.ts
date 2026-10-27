/**
 * @fileoverview {@link ImapTimeoutError} — a deadline passed.
 *
 * @module
 */

import { MailError } from './Base.ts';

/**
 * Thrown when connecting, or a single command, takes longer than the
 * configured timeout. The connection is closed before this is thrown
 * because the protocol state is unknown once a reply is cut short, so
 * the client must be reconnected.
 */
export class ImapTimeoutError extends MailError<{
  operation: string;
  timeoutMs: number;
}> {
  constructor(operation: string, timeoutMs: number) {
    super('IMAP ${operation} timed out after ${timeoutMs}ms', {
      operation,
      timeoutMs,
    });
  }
}
