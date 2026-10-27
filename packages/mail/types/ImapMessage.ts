import type { ImapEnvelope } from './ImapEnvelope.ts';

/**
 * One message from `fetch()`. Only the requested items are set; `uid` and
 * `seq` (the message sequence number at the time of the reply) always are.
 */
export type ImapMessage = {
  uid: number;
  seq: number;
  flags?: string[];
  internalDate?: Date;
  /** `RFC822.SIZE`: the raw message length in bytes. */
  size?: number;
  envelope?: ImapEnvelope;
  /** The raw RFC 5322 message, ready for `parseMessage()`. */
  body?: Uint8Array;
  /** The raw header block, terminated by its blank line. */
  header?: Uint8Array;
};
