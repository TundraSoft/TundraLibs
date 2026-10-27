/**
 * @fileoverview `@tundralibs/mail` — IMAP client and MIME parser for
 * Deno, Bun, Node.js and Cloudflare Workers.
 *
 * @module
 */

export {
  ImapAuthError,
  ImapConnectionError,
  ImapMessageTooLargeError,
  ImapParseError,
  ImapResponseError,
  ImapTimeoutError,
  MailError,
} from './errors/mod.ts';
export { decodeUtf7, encodeUtf7, ImapClient } from './imap/mod.ts';
export {
  decodeBase64,
  decodeEncodedWords,
  decodeQuotedPrintable,
  decodeText,
  decodeTransfer,
  getHeader,
  getHeaders,
  parseAddressList,
  parseContentType,
  parseDate,
  parseMessage,
  parseMessageIds,
  parseParameterized,
  parseRawHeaders,
} from './mime/mod.ts';
export type {
  ImapClientOptions,
  ImapEnvelope,
  ImapFetchItem,
  ImapFetchOptions,
  ImapFlagMode,
  ImapMailbox,
  ImapMailboxStatus,
  ImapMessage,
  ImapSearchCriteria,
  ImapUidSet,
  MailAddress,
  MailAttachment,
  MailContentType,
  MailHeader,
  MailMessage,
  MailPart,
} from './types/mod.ts';
