/**
 * @fileoverview Tokenizer for the data part of a server response:
 * atoms, quoted strings, literals, NIL, parenthesised lists and
 * bracketed sections (`BODY[HEADER]`).
 *
 * @module
 */

import { ImapParseError } from '../errors/mod.ts';

/**
 * A piece of one response line as the transport delivers it: text, or a
 * literal whose `{n}` announcement ended the previous piece. `truncated`
 * means the literal was longer than the limit and the excess was
 * discarded.
 */
export type ImapSegment =
  | string
  | { literal: Uint8Array; size: number; truncated: boolean };

/** One token of a tokenized response. */
export type ImapToken =
  | { kind: 'atom'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'literal'; value: Uint8Array; size: number; truncated: boolean }
  | { kind: 'nil' }
  | { kind: 'list'; items: ImapToken[] }
  | { kind: 'section'; items: ImapToken[] };

const UTF8 = new TextDecoder();
const ATOM_END = new Set([' ', '(', ')', '[', ']', '{', '"']);

/** Render segments as one line for error messages, literals as `{n}`. */
export function segmentsToText(segments: ImapSegment[]): string {
  return segments.map((s) => typeof s === 'string' ? s : `{${s.size}}`).join(
    '',
  );
}

class Cursor {
  private __seg = 0;
  private __pos = 0;

  constructor(private readonly __segments: ImapSegment[]) {}

  /** The current text segment, skipping into the next one when exhausted. */
  private __text(): string | undefined {
    for (;;) {
      const s = this.__segments[this.__seg];
      if (s === undefined) return undefined;
      if (typeof s !== 'string') return undefined;
      if (this.__pos < s.length) return s;
      this.__seg++;
      this.__pos = 0;
    }
  }

  peek(): string | undefined {
    const s = this.__text();
    if (s !== undefined) return s[this.__pos];
    return this.__segments[this.__seg] === undefined ? undefined : '{';
  }

  next(): string {
    const s = this.__text()!;
    return s[this.__pos++]!;
  }

  literal(): Extract<ImapSegment, object> {
    const s = this.__segments[this.__seg] as Extract<ImapSegment, object>;
    this.__seg++;
    this.__pos = 0;
    return s;
  }

  get done(): boolean {
    return this.peek() === undefined;
  }
}

function parseItems(c: Cursor, close: string | undefined, line: string) {
  const items: ImapToken[] = [];
  for (;;) {
    const ch = c.peek();
    if (ch === undefined) {
      if (close) throw new ImapParseError(`missing '${close}'`, line);
      return items;
    }
    if (ch === ' ') {
      c.next();
      continue;
    }
    if (ch === close) {
      c.next();
      return items;
    }
    if (ch === ')' || ch === ']') {
      throw new ImapParseError(`unexpected '${ch}'`, line);
    }
    if (ch === '(') {
      c.next();
      items.push({ kind: 'list', items: parseItems(c, ')', line) });
      continue;
    }
    if (ch === '[') {
      c.next();
      items.push({ kind: 'section', items: parseItems(c, ']', line) });
      continue;
    }
    if (ch === '{') {
      const lit = c.literal();
      items.push({
        kind: 'literal',
        value: lit.literal,
        size: lit.size,
        truncated: lit.truncated,
      });
      continue;
    }
    if (ch === '"') {
      c.next();
      let value = '';
      for (;;) {
        const q = c.peek();
        if (q === undefined) {
          throw new ImapParseError('unterminated string', line);
        }
        c.next();
        if (q === '"') break;
        if (q === '\\') {
          const e = c.peek();
          if (e === undefined) {
            throw new ImapParseError('unterminated string', line);
          }
          value += c.next();
        } else {
          value += q;
        }
      }
      items.push({ kind: 'string', value });
      continue;
    }
    let atom = '';
    while (!c.done && !ATOM_END.has(c.peek()!)) atom += c.next();
    // `BODY[...]` keeps its section; `[` after an atom belongs to it.
    items.push(
      atom.toUpperCase() === 'NIL'
        ? { kind: 'nil' }
        : { kind: 'atom', value: atom },
    );
  }
}

/**
 * Tokenize the segments of one response (the part after the tag).
 *
 * @throws {ImapParseError} On an unbalanced list or section, or an
 *   unterminated quoted string.
 */
export function tokenize(segments: ImapSegment[]): ImapToken[] {
  return parseItems(new Cursor(segments), undefined, segmentsToText(segments));
}

/** The text of an atom, string or literal token; `undefined` for anything else. */
export function tokenText(token: ImapToken | undefined): string | undefined {
  if (!token) return undefined;
  switch (token.kind) {
    case 'atom':
    case 'string':
      return token.value;
    case 'literal':
      return UTF8.decode(token.value);
    default:
      return undefined;
  }
}

/** The numeric value of an atom token, or `undefined`. */
export function tokenNumber(token: ImapToken | undefined): number | undefined {
  if (token?.kind !== 'atom') return undefined;
  const n = Number(token.value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** The items of a list token, or an empty array for anything else. */
export function tokenList(token: ImapToken | undefined): ImapToken[] {
  return token?.kind === 'list' ? token.items : [];
}
