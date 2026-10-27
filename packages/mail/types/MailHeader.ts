/**
 * One header field after unfolding and RFC 2047 decoding. `name` keeps
 * the sender's capitalisation; compare it case-insensitively, or use
 * `getHeader` from `@tundralibs/mail/mime`.
 */
export type MailHeader = {
  name: string;
  value: string;
};
