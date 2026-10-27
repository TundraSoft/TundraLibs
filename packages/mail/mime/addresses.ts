/**
 * @fileoverview RFC 5322 §3.4 address-list parsing, tolerant of the
 * unquoted names, bare addresses and stray punctuation real mail has.
 *
 * @module
 */

import type { MailAddress } from '../types/mod.ts';
import { decodeEncodedWords } from './encodedWord.ts';
import { splitUnquoted, stripComments, unquote } from './headers.ts';

/** Text of the first comment in `text`, for `addr (Name)` forms. */
function firstComment(text: string): string | undefined {
  const m = /\(([^()]*)\)/.exec(text);
  return m ? m[1]!.trim() : undefined;
}

function parseMailbox(item: string, out: MailAddress[]): void {
  const trimmed = item.trim();
  if (trimmed.length === 0) return;

  const lt = trimmed.lastIndexOf('<');
  if (lt >= 0) {
    // A missing '>' is common enough in hand-typed mail: take the rest.
    const gt = trimmed.indexOf('>', lt);
    const end = gt > lt ? gt : trimmed.length;
    const address = stripComments(trimmed.slice(lt + 1, end)).trim();
    const namePart = trimmed.slice(0, lt) + trimmed.slice(end + 1);
    const name = decodeEncodedWords(unquote(stripComments(namePart))).trim();
    out.push(name ? { name, address } : { address });
    return;
  }

  const comment = firstComment(trimmed);
  const address = stripComments(trimmed).trim();
  if (address.length === 0) return;
  out.push(
    comment ? { name: decodeEncodedWords(comment), address } : { address },
  );
}

/**
 * Parse an address header value into mailboxes. Groups (`Name: a, b;`)
 * are flattened to their members; a comment beside a bare address
 * becomes its name; a value that is not an address at all is returned as
 * `address` so nothing is silently lost.
 */
export function parseAddressList(text: string | undefined): MailAddress[] {
  const out: MailAddress[] = [];
  if (!text) return out;
  // ';' closes a group; a ':' before any '<' opens one.
  for (const chunk of splitUnquoted(text, ';')) {
    const [head, ...rest] = splitUnquoted(chunk, ':');
    const members = rest.length > 0 && !head!.includes('<')
      ? rest.join(':')
      : chunk;
    for (const item of splitUnquoted(members, ',')) parseMailbox(item, out);
  }
  return out;
}
