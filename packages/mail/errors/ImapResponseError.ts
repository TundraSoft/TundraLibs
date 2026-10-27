/**
 * @fileoverview {@link ImapResponseError} — a command was answered NO or BAD.
 *
 * @module
 */

import { MailError } from './Base.ts';

/**
 * Thrown when the server answers a command with a tagged NO (the command
 * was understood but refused: no such mailbox, read-only, over quota) or
 * BAD (the command was malformed). `context.status` tells the two apart,
 * `context.text` is the server's human-readable text and `context.code`
 * the bracketed response code when one was sent (`TRYCREATE`,
 * `NONEXISTENT`, `CANNOT`, …).
 */
export class ImapResponseError extends MailError<{
  command: string;
  status: 'NO' | 'BAD';
  text: string;
  code?: string;
}> {
  constructor(
    command: string,
    status: 'NO' | 'BAD',
    text: string,
    code?: string,
  ) {
    super('IMAP ${command} answered ${status}: ${text}', {
      command,
      status,
      text,
      code,
    });
  }
}
