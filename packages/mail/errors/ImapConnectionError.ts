/**
 * @fileoverview {@link ImapConnectionError} — the socket is gone or unusable.
 *
 * @module
 */

import { MailError } from './Base.ts';

/**
 * Thrown when the connection closes (EOF, reset, a `* BYE` from the
 * server) in the middle of an operation, when the caller's `AbortSignal`
 * fires, or when a command is issued on a client that is not connected.
 * `context.reason` says which.
 */
export class ImapConnectionError extends MailError<{
  operation: string;
  reason: string;
}> {
  constructor(operation: string, reason: string, cause?: Error) {
    super('IMAP ${operation} failed: ${reason}', { operation, reason }, cause);
  }
}
