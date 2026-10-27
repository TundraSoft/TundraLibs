/**
 * What SELECT or EXAMINE reported about the mailbox now open.
 */
export type ImapMailboxStatus = {
  name: string;
  /** `true` after EXAMINE, or when the server answered `[READ-ONLY]`. */
  readOnly: boolean;
  /** Message count. */
  exists: number;
  recent?: number;
  /** Sequence number of the first unseen message, when the server sent `[UNSEEN n]`. */
  unseen?: number;
  flags: string[];
  permanentFlags?: string[];
  /**
   * Changes only when the server has renumbered the mailbox; a cached
   * UID is valid only together with the UIDVALIDITY it was read under.
   */
  uidValidity?: number;
  uidNext?: number;
};
