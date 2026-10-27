/**
 * @fileoverview Raw RFC 5322 bytes to a {@link MailMessage}: header
 * decoding, the MIME part tree, transfer and charset decoding, and the
 * flattened text / html / attachments view.
 *
 * @module
 */

import type {
  MailAttachment,
  MailHeader,
  MailMessage,
  MailPart,
} from '../types/mod.ts';
import { parseAddressList } from './addresses.ts';
import { decodeText } from './charset.ts';
import { parseDate } from './dates.ts';
import { decodeEncodedWords } from './encodedWord.ts';
import {
  getHeader,
  parseContentType,
  parseMessageIds,
  parseParameterized,
  parseRawHeaders,
} from './headers.ts';
import { decodeTransfer } from './transferEncoding.ts';

const EMPTY = new Uint8Array(0);
const ASCII = new TextEncoder();

/** Index of `needle` in `buf` at or after `from`, or -1. */
function indexOf(buf: Uint8Array, needle: Uint8Array, from: number): number {
  const first = needle[0]!;
  const last = buf.length - needle.length;
  outer: for (let i = from; i <= last; i++) {
    if (buf[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Split at the first blank line; a part with no blank line is all header. */
function splitHeaderBody(
  bytes: Uint8Array,
): { header: Uint8Array; body: Uint8Array } {
  // A body with no headers at all starts with the blank line itself.
  if (bytes[0] === 0x0a) return { header: EMPTY, body: bytes.subarray(1) };
  if (bytes[0] === 0x0d && bytes[1] === 0x0a) {
    return { header: EMPTY, body: bytes.subarray(2) };
  }
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0x0a) continue;
    if (bytes[i + 1] === 0x0a) {
      return { header: bytes.subarray(0, i), body: bytes.subarray(i + 2) };
    }
    if (bytes[i + 1] === 0x0d && bytes[i + 2] === 0x0a) {
      return { header: bytes.subarray(0, i), body: bytes.subarray(i + 3) };
    }
  }
  return { header: bytes, body: EMPTY };
}

/**
 * Cut a multipart body at its `--boundary` lines. A missing closing
 * delimiter lets the last part run to the end; a body with no delimiter
 * at all yields no parts.
 */
function splitMultipart(body: Uint8Array, boundary: string): Uint8Array[] {
  const delim = ASCII.encode('--' + boundary);
  const parts: Uint8Array[] = [];
  let start = -1;
  let pos = 0;
  while (pos <= body.length) {
    const at = indexOf(body, delim, pos);
    if (at < 0) {
      if (start >= 0) parts.push(trimLineEnd(body.subarray(start)));
      break;
    }
    const atLineStart = at === 0 || body[at - 1] === 0x0a;
    const after = at + delim.length;
    const closing = body[after] === 0x2d && body[after + 1] === 0x2d;
    if (!atLineStart) {
      pos = after;
      continue;
    }
    if (start >= 0) parts.push(trimLineEnd(body.subarray(start, at)));
    if (closing) break;
    const eol = body.indexOf(0x0a, after);
    if (eol < 0) break;
    start = eol + 1;
    pos = start;
  }
  return parts;
}

/** Drop the CRLF (or LF) that belongs to the following delimiter. */
function trimLineEnd(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  if (end > 0 && bytes[end - 1] === 0x0a) end--;
  if (end > 0 && bytes[end - 1] === 0x0d) end--;
  return bytes.subarray(0, end);
}

function buildPart(bytes: Uint8Array): { part: MailPart; raw: MailHeader[] } {
  const { header, body } = splitHeaderBody(bytes);
  const raw = parseRawHeaders(header);
  const contentType = parseContentType(getHeader(raw, 'content-type'));
  const encodingHeader = getHeader(raw, 'content-transfer-encoding');
  const encoding = encodingHeader
    ? parseParameterized(encodingHeader).value
    : '7bit';
  const dispositionHeader = getHeader(raw, 'content-disposition');
  const disposition = dispositionHeader
    ? parseParameterized(dispositionHeader)
    : undefined;
  const filename = disposition?.params['filename'] ??
    contentType.params['name'];
  const contentId = parseMessageIds(getHeader(raw, 'content-id'))[0];
  const charset = contentType.params['charset']?.toLowerCase();

  const part: MailPart = {
    headers: raw.map((h) => ({
      name: h.name,
      value: decodeEncodedWords(h.value),
    })),
    contentType,
    encoding,
    content: EMPTY,
    children: [],
  };
  if (disposition?.value) part.disposition = disposition.value;
  if (filename) part.filename = filename;
  if (contentId) part.contentId = contentId;
  if (charset) part.charset = charset;

  const boundary = contentType.params['boundary'];
  if (contentType.type === 'multipart' && boundary) {
    part.children = splitMultipart(body, boundary).map((b) =>
      buildPart(b).part
    );
    return { part, raw };
  }

  part.content = decodeTransfer(body, encoding);
  if (contentType.type === 'text' || contentType.type === 'multipart') {
    part.text = decodeText(part.content, charset);
  } else if (
    contentType.type === 'message' && contentType.subtype === 'rfc822'
  ) {
    part.message = parseMessage(part.content);
  }
  return { part, raw };
}

type Flattened = {
  text?: string;
  html?: string;
  attachments: MailAttachment[];
};

function flatten(part: MailPart, acc: Flattened): void {
  if (part.children.length > 0) {
    for (const child of part.children) flatten(child, acc);
    return;
  }
  const { type, subtype } = part.contentType;
  const named = part.disposition === 'attachment' ||
    part.filename !== undefined;
  // A multipart with no usable boundary was decoded as text above.
  if (!named && part.text !== undefined && type !== 'message') {
    if (type === 'text' && subtype === 'html') {
      acc.html = acc.html === undefined
        ? part.text
        : acc.html + '\n' + part.text;
    } else {
      acc.text = acc.text === undefined
        ? part.text
        : acc.text + '\n' + part.text;
    }
    return;
  }
  const inline = part.disposition === 'inline' ||
    (part.contentId !== undefined && part.disposition !== 'attachment');
  const attachment: MailAttachment = {
    contentType: `${type}/${subtype}`,
    disposition: inline ? 'inline' : 'attachment',
    size: part.content.length,
    content: part.content,
  };
  if (part.filename !== undefined) attachment.filename = part.filename;
  if (part.contentId !== undefined) attachment.contentId = part.contentId;
  acc.attachments.push(attachment);
}

/**
 * Parse a raw message. Never throws on malformed input: an unreadable
 * header line is dropped, an unknown charset falls back to Latin-1, a
 * multipart with no boundary is read as plain text, and a truncated
 * body is decoded as far as it goes.
 *
 * @param bytes - The message as received, e.g. `ImapMessage.body`.
 * @returns The parsed {@link MailMessage}.
 */
export function parseMessage(bytes: Uint8Array): MailMessage {
  const { part: root, raw } = buildPart(bytes);
  const flat: Flattened = { attachments: [] };
  flatten(root, flat);

  const message: MailMessage = {
    headers: root.headers,
    from: parseAddressList(getHeader(raw, 'from')),
    replyTo: parseAddressList(getHeader(raw, 'reply-to')),
    to: parseAddressList(getHeader(raw, 'to')),
    cc: parseAddressList(getHeader(raw, 'cc')),
    bcc: parseAddressList(getHeader(raw, 'bcc')),
    inReplyTo: parseMessageIds(getHeader(raw, 'in-reply-to')),
    references: parseMessageIds(getHeader(raw, 'references')),
    attachments: flat.attachments,
    root,
  };
  const subject = getHeader(root.headers, 'subject');
  if (subject !== undefined) message.subject = subject;
  const sender = parseAddressList(getHeader(raw, 'sender'))[0];
  if (sender) message.sender = sender;
  const date = parseDate(getHeader(raw, 'date') ?? '');
  if (date) message.date = date;
  const messageId = parseMessageIds(getHeader(raw, 'message-id'))[0];
  if (messageId) message.messageId = messageId;
  if (flat.text !== undefined) message.text = flat.text;
  if (flat.html !== undefined) message.html = flat.html;
  const autoSubmitted = getHeader(raw, 'auto-submitted');
  if (autoSubmitted) message.autoSubmitted = autoSubmitted.toLowerCase();
  const precedence = getHeader(raw, 'precedence');
  if (precedence) message.precedence = precedence.toLowerCase();
  const listId = getHeader(raw, 'list-id');
  if (listId) message.listId = listId;
  const xAutoreply = getHeader(raw, 'x-autoreply');
  if (xAutoreply) message.xAutoreply = xAutoreply;
  return message;
}
