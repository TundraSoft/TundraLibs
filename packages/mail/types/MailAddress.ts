/**
 * One mailbox from an address header or an IMAP ENVELOPE: the display
 * name when one was given, and the `local@domain` address. A malformed
 * address keeps whatever text was there in `address` rather than being
 * dropped.
 */
export type MailAddress = {
  name?: string;
  address: string;
};
