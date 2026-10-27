/**
 * @fileoverview Client-to-server formatting: strings as atom, quoted or
 * literal, mailbox names, dates, UID sets, search keys.
 *
 * @module
 */

import { MailError } from '../errors/mod.ts';
import type { ImapSearchCriteria, ImapUidSet } from '../types/mod.ts';
import { encodeUtf7 } from './utf7.ts';

/**
 * One argument of a command: text written as is, or bytes the client
 * sends as a `{n}` literal after the server's continuation.
 */
export type ImapArg = string | { literal: Uint8Array };

const UTF8 = new TextEncoder();
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const ATOM_SAFE = /^[A-Za-z0-9!#$&'+,.\/:;<=>?@^_`|~-]+$/;

/**
 * Format `text` as the smallest IMAP string form that carries it: a bare
 * atom, a quoted string, or a literal when it holds CR, LF, NUL or a
 * non-ASCII character.
 */
export function astring(text: string): ImapArg {
  if (text.length > 0 && ATOM_SAFE.test(text)) return text;
  if (/[^\x20-\x7e]/.test(text)) return { literal: UTF8.encode(text) };
  return '"' + text.replace(/[\\"]/g, '\\$&') + '"';
}

/** A mailbox name: modified UTF-7, then quoted (never a bare atom). */
export function mailboxArg(name: string): ImapArg {
  const encoded = encodeUtf7(name);
  return '"' + encoded.replace(/[\\"]/g, '\\$&') + '"';
}

/** `DD-Mon-YYYY` from the UTC calendar day of `date`. */
export function formatDate(date: Date): string {
  return `${date.getUTCDate()}-${
    MONTHS[date.getUTCMonth()]
  }-${date.getUTCFullYear()}`;
}

/**
 * Join a {@link ImapUidSet} into IMAP sequence-set syntax, collapsing
 * consecutive numbers into ranges.
 *
 * @throws {MailError} For an empty list, a non-positive UID, or a raw
 *   string with characters outside `0-9 : * ,`.
 */
export function formatUidSet(set: ImapUidSet): string {
  if (typeof set === 'string') {
    if (!/^[0-9*][0-9*:,]*$/.test(set)) {
      throw new MailError('Invalid IMAP sequence set: ${set}', { set });
    }
    return set;
  }
  const uids = (typeof set === 'number' ? [set] : [...new Set(set)]).sort(
    (a, b) => a - b,
  );
  if (uids.length === 0) throw new MailError('Empty UID set');
  if (!uids.every((u) => Number.isInteger(u) && u > 0)) {
    throw new MailError('UIDs must be positive integers: ${set}', {
      set: uids,
    });
  }
  const ranges: string[] = [];
  for (let i = 0; i < uids.length;) {
    let j = i;
    while (j + 1 < uids.length && uids[j + 1] === uids[j]! + 1) j++;
    ranges.push(i === j ? `${uids[i]}` : `${uids[i]}:${uids[j]}`);
    i = j + 1;
  }
  return ranges.join(',');
}

/** The search keys for `criteria`, in command-argument form. */
export function formatSearch(criteria: ImapSearchCriteria): ImapArg[] {
  const args: ImapArg[] = [];
  const flag = (key: keyof ImapSearchCriteria, name: string) => {
    const v = criteria[key];
    if (v === true) args.push(name);
    else if (v === false) args.push('UN' + name);
  };
  flag('seen', 'SEEN');
  flag('flagged', 'FLAGGED');
  flag('answered', 'ANSWERED');
  flag('deleted', 'DELETED');
  if (criteria.since) args.push('SINCE', formatDate(criteria.since));
  if (criteria.before) args.push('BEFORE', formatDate(criteria.before));
  if (criteria.on) args.push('ON', formatDate(criteria.on));
  if (criteria.uid !== undefined) args.push('UID', formatUidSet(criteria.uid));
  if (criteria.from !== undefined) args.push('FROM', astring(criteria.from));
  if (criteria.to !== undefined) args.push('TO', astring(criteria.to));
  if (criteria.subject !== undefined) {
    args.push('SUBJECT', astring(criteria.subject));
  }
  if (criteria.raw) args.push(criteria.raw.trim());
  if (args.length === 0) args.push('ALL');
  // A literal in a search key carries non-ASCII, which needs a charset.
  if (args.some((a) => typeof a !== 'string')) args.unshift('CHARSET', 'UTF-8');
  return args;
}

/** The SASL PLAIN initial response, base64 encoded. */
export function encodeAuthPlain(user: string, pass: string): string {
  const bytes = UTF8.encode(`\0${user}\0${pass}`);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const INTERNALDATE =
  /^\s*(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})\s*$/;

/** Parse an INTERNALDATE such as `17-Jul-1996 02:44:25 -0700`. */
export function parseInternalDate(text: string): Date | undefined {
  const m = INTERNALDATE.exec(text);
  if (!m) return undefined;
  const month = MONTHS.findIndex((n) =>
    n.toLowerCase() === m[2]!.toLowerCase()
  );
  if (month < 0) return undefined;
  const offset = (m[7] === '-' ? -1 : 1) *
    (Number(m[8]) * 60 + Number(m[9]));
  return new Date(
    Date.UTC(
      Number(m[3]),
      month,
      Number(m[1]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    ) - offset * 60_000,
  );
}
