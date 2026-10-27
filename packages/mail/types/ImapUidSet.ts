/**
 * The messages a UID command applies to: one UID, a list of UIDs (joined
 * into ranges on the wire), or a raw IMAP sequence set such as `1:*` or
 * `100:200,300`.
 */
export type ImapUidSet = number | number[] | string;
