import type { ImapUidSet } from './ImapUidSet.ts';

/**
 * Criteria for UID SEARCH. Every key set is ANDed. Dates compare the
 * message's internal date by calendar day in the server's timezone, as
 * IMAP defines them. `raw` is appended verbatim for anything not covered.
 * An empty object searches ALL.
 */
export type ImapSearchCriteria = {
  seen?: boolean;
  flagged?: boolean;
  answered?: boolean;
  deleted?: boolean;
  /** Internal date on or after this day. */
  since?: Date;
  /** Internal date before this day. */
  before?: Date;
  /** Internal date on this day. */
  on?: Date;
  uid?: ImapUidSet;
  /** Substring match on the From header. */
  from?: string;
  /** Substring match on the To header. */
  to?: string;
  /** Substring match on the Subject header. */
  subject?: string;
  /** Raw search keys appended as given, e.g. `'HEADER X-Ticket TKT-1 LARGER 1000'`. */
  raw?: string;
};
