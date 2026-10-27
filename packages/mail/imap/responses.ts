/**
 * @fileoverview Reads one complete server response (its line plus any
 * literals it announces) and classifies it: continuation, status, or
 * data.
 *
 * @module
 */

import { ImapParseError } from '../errors/mod.ts';
import type { ImapTransport } from './ImapTransport.ts';
import {
  type ImapSegment,
  type ImapToken,
  segmentsToText,
  tokenize,
} from './parser.ts';

/** One server response, read in full. */
export type ImapResponse = {
  /** `*` for untagged, `+` for a continuation request, else the command tag. */
  tag: string;
  /** Everything after the tag, literals shown as `{n}`. */
  text: string;
  /** Set for OK / NO / BAD / PREAUTH / BYE lines. */
  status?: {
    status: 'OK' | 'NO' | 'BAD' | 'PREAUTH' | 'BYE';
    /** The bracketed response code, tokenized, when present. */
    code?: ImapToken[];
    text: string;
  };
  /** Set for untagged data lines (`* 3 FETCH …`, `* LIST …`). */
  tokens?: ImapToken[];
};

const UTF8 = new TextDecoder();
const LITERAL_SUFFIX = /\{(\d+)\}$/;
const STATUS =
  /^(OK|NO|BAD|PREAUTH|BYE)(?:\s+\[([^\]]*)\])?(?:\s+([\s\S]*))?$/i;

/**
 * Read the next response. Returns `null` on EOF.
 *
 * @param maxLiteral - Bytes of each literal to keep; the rest is drained.
 * @throws {ImapParseError} When the line cannot be tokenized.
 */
export async function readResponse(
  transport: ImapTransport,
  maxLiteral: number,
): Promise<ImapResponse | null> {
  const segments: ImapSegment[] = [];
  for (;;) {
    const line = await transport.readLine();
    if (line === null) return null;
    const text = UTF8.decode(line);
    const m = LITERAL_SUFFIX.exec(text);
    if (!m) {
      segments.push(text);
      break;
    }
    segments.push(text.slice(0, m.index));
    const size = Number(m[1]);
    const data = await transport.readBytes(size, maxLiteral);
    if (data === null) return null;
    segments.push({ literal: data, size, truncated: data.length < size });
  }

  const first = segments[0] as string;
  const space = first.indexOf(' ');
  const tag = space < 0 ? first : first.slice(0, space);
  const rest: ImapSegment[] = [
    space < 0 ? '' : first.slice(space + 1),
    ...segments.slice(1),
  ];
  const restText = segmentsToText(rest);
  const response: ImapResponse = { tag, text: restText };

  if (tag === '+') return response;
  const status = segments.length === 1 ? STATUS.exec(restText) : null;
  if (status) {
    response.status = {
      status: status[1]!.toUpperCase() as NonNullable<
        ImapResponse['status']
      >['status'],
      text: status[3] ?? '',
    };
    if (status[2] !== undefined) response.status.code = tokenize([status[2]]);
    return response;
  }
  if (tag !== '*') {
    throw new ImapParseError('tagged line is not a status', restText);
  }
  response.tokens = tokenize(rest);
  return response;
}
