/**
 * @fileoverview SASLprep (RFC 4013) string preparation for SCRAM passwords.
 *
 * SCRAM (RFC 5802) derives `SaltedPassword = Hi(Normalize(password), ...)`,
 * where `Normalize` is the SASLprep stringprep profile (RFC 4013, built on
 * RFC 3454). A spec-compliant Postgres server SASLpreps the stored password,
 * so a client that skips it computes a different key for any password that
 * contains non-ASCII or otherwise-normalizable code points (accented
 * letters, full-width digits, a non-breaking space, …) and authentication
 * fails. This module applies SASLprep so the derived key matches the server.
 *
 * ## What this implementation covers
 *
 * - **Mapping** (RFC 4013 §2.1): the RFC 3454 table B.1 "commonly mapped to
 *   nothing" set is deleted; the table C.1.2 non-ASCII space set is mapped to
 *   U+0020 SPACE.
 * - **Normalization** (§2.2): Unicode **NFKC** via the runtime's built-in
 *   `String.prototype.normalize('NFKC')` (available on Deno, Bun and Node).
 * - **Prohibited output** (§2.3): every code point in RFC 3454 tables C.2.1,
 *   C.2.2, C.3, C.4, C.5, C.6, C.7, C.8 and C.9 (control characters, private
 *   use, non-characters, surrogates, tagging characters, bidi controls, …) is
 *   rejected with a thrown {@link DriverError} rather than silently hashed.
 * - **Bidirectional check** (§2.4 / RFC 3454 §6): the endpoint rule — a string
 *   containing any RandALCat (table D.1) character must both begin and end
 *   with a RandALCat character — is enforced.
 *
 * ## Known limitations (deliberately out of scope)
 *
 * - **Unassigned code points** (RFC 3454 table A.1) are *not* exhaustively
 *   rejected. Doing so faithfully requires bundling the full Unicode
 *   assigned-character database, which this dependency-free driver will not
 *   carry. The finite prohibited ranges above (which include the
 *   security-relevant private-use, surrogate and non-character blocks) are
 *   rejected; a still-unassigned code point that a strict server would reject
 *   would instead fail later as an auth mismatch, not a silent success.
 * - **Bidi rule 1** (a RandALCat string must not also contain an LCat, table
 *   D.2, character) is not enforced, as LCat is effectively "every
 *   left-to-right letter" and needs the same large table. The endpoint rule
 *   (bidi rule 2) is enforced and catches the common malformed cases.
 *
 * @module
 */

import { DriverError } from '../../errors/mod.ts';

/**
 * RFC 3454 table B.1 — "Commonly mapped to nothing". These code points are
 * deleted during the mapping step.
 */
const MAP_TO_NOTHING: ReadonlySet<number> = new Set<number>([
  0x00ad,
  0x034f,
  0x1806,
  0x180b,
  0x180c,
  0x180d,
  0x200b,
  0x200c,
  0x200d,
  0x2060,
  0xfe00,
  0xfe01,
  0xfe02,
  0xfe03,
  0xfe04,
  0xfe05,
  0xfe06,
  0xfe07,
  0xfe08,
  0xfe09,
  0xfe0a,
  0xfe0b,
  0xfe0c,
  0xfe0d,
  0xfe0e,
  0xfe0f,
  0xfeff,
]);

/**
 * RFC 3454 table C.1.2 — non-ASCII space characters, mapped to U+0020 SPACE.
 * U+200B is intentionally absent here: it is already removed by
 * {@link MAP_TO_NOTHING}, which is applied first.
 */
const MAP_TO_SPACE: ReadonlySet<number> = new Set<number>([
  0x00a0,
  0x1680,
  0x2000,
  0x2001,
  0x2002,
  0x2003,
  0x2004,
  0x2005,
  0x2006,
  0x2007,
  0x2008,
  0x2009,
  0x200a,
  0x202f,
  0x205f,
  0x3000,
]);

/**
 * Prohibited output ranges — the union of RFC 3454 tables C.2.1, C.2.2, C.3,
 * C.4, C.5, C.6, C.7, C.8 and C.9, as inclusive `[lo, hi]` code-point pairs.
 * A password is a "stored string", so any of these makes it invalid.
 */
const PROHIBITED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f], // C.2.1 ASCII control
  [0x007f, 0x009f], // C.2.1 DEL + C.2.2 C1 control
  [0x0340, 0x0341], // C.8 combining grapheme joiner replacements
  [0x06dd, 0x06dd], // C.2.2
  [0x070f, 0x070f], // C.2.2
  [0x180e, 0x180e], // C.2.2
  [0x200c, 0x200f], // C.2.2 (ZWNJ/ZWJ) + C.8 (LRM/RLM)
  [0x2028, 0x202e], // C.2.2 (line/para sep) + C.8 (bidi embeddings)
  [0x2060, 0x2063], // C.2.2 word joiner / invisible operators
  [0x206a, 0x206f], // C.2.2 + C.8 deprecated format controls
  [0x2ff0, 0x2ffb], // C.7 ideographic description characters
  [0xd800, 0xdfff], // C.5 surrogate code points
  [0xe000, 0xf8ff], // C.3 private use (BMP)
  [0xfdd0, 0xfdef], // C.4 non-characters
  [0xfff9, 0xfffd], // C.6 interlinear annotation + replacement char
  [0xfffe, 0xffff], // C.4 non-characters
  [0x1d173, 0x1d17a], // C.2.2 musical formatting
  [0x1fffe, 0x1ffff], // C.4
  [0x2fffe, 0x2ffff], // C.4
  [0x3fffe, 0x3ffff], // C.4
  [0x4fffe, 0x4ffff], // C.4
  [0x5fffe, 0x5ffff], // C.4
  [0x6fffe, 0x6ffff], // C.4
  [0x7fffe, 0x7ffff], // C.4
  [0x8fffe, 0x8ffff], // C.4
  [0x9fffe, 0x9ffff], // C.4
  [0xafffe, 0xaffff], // C.4
  [0xbfffe, 0xbffff], // C.4
  [0xcfffe, 0xcffff], // C.4
  [0xdfffe, 0xdffff], // C.4
  [0xe0001, 0xe0001], // C.9 language tag
  [0xe0020, 0xe007f], // C.9 tag characters
  [0xefffe, 0xeffff], // C.4
  [0xf0000, 0xffffd], // C.3 private use (plane 15)
  [0xffffe, 0xfffff], // C.4
  [0x100000, 0x10fffd], // C.3 private use (plane 16)
  [0x10fffe, 0x10ffff], // C.4
];

/**
 * RFC 3454 table D.1 — code points with bidirectional property "R" or "AL"
 * (RandALCat), as inclusive `[lo, hi]` pairs. Used for the endpoint bidi rule.
 */
const RAND_AL_CAT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x05be, 0x05be],
  [0x05c0, 0x05c0],
  [0x05c3, 0x05c3],
  [0x05d0, 0x05ea],
  [0x05f0, 0x05f4],
  [0x061b, 0x061b],
  [0x061f, 0x061f],
  [0x0621, 0x063a],
  [0x0640, 0x064a],
  [0x066d, 0x066f],
  [0x0671, 0x06d5],
  [0x06dd, 0x06dd],
  [0x06e5, 0x06e6],
  [0x06fa, 0x06fe],
  [0x0700, 0x070d],
  [0x0710, 0x0710],
  [0x0712, 0x072c],
  [0x0780, 0x07a5],
  [0x07b1, 0x07b1],
  [0x200f, 0x200f],
  [0xfb1d, 0xfb1d],
  [0xfb1f, 0xfb28],
  [0xfb2a, 0xfb36],
  [0xfb38, 0xfb3c],
  [0xfb3e, 0xfb3e],
  [0xfb40, 0xfb41],
  [0xfb43, 0xfb44],
  [0xfb46, 0xfbb1],
  [0xfbd3, 0xfd3d],
  [0xfd50, 0xfd8f],
  [0xfd92, 0xfdc7],
  [0xfdf0, 0xfdfc],
  [0xfe70, 0xfe74],
  [0xfe76, 0xfefc],
];

/** True if `cp` falls in any inclusive range in `ranges`. */
function _inRanges(
  cp: number,
  ranges: ReadonlyArray<readonly [number, number]>,
): boolean {
  for (const [lo, hi] of ranges) {
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

/** Format a code point as `U+XXXX` for error messages. */
function _u(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * Prepare `input` per the SASLprep (RFC 4013) stringprep profile so it can be
 * fed to SCRAM's `Hi()`/PBKDF2 and match a spec-compliant server.
 *
 * All-ASCII passwords with no NFKC-relevant characters are returned
 * unchanged, preserving existing behaviour.
 *
 * @param input - The raw password as supplied by the caller.
 * @returns The SASLprep'd string (NFKC-normalized, mapped).
 *
 * @throws {DriverError} When `input` contains a code point prohibited by RFC
 *   3454 tables C.* (control, private-use, surrogate, non-character, bidi
 *   control, tagging, …).
 * @throws {DriverError} When `input` violates the bidirectional endpoint rule
 *   (RFC 3454 §6): a right-to-left string must both start and end with a
 *   RandALCat character.
 */
export function saslPrep(input: string): string {
  // Step 1 — Mapping (RFC 4013 §2.1). Iterate by code point so astral
  // characters are handled as single units.
  let mapped = '';
  for (const ch of input) {
    const cp = ch.codePointAt(0)!;
    if (MAP_TO_NOTHING.has(cp)) continue;
    if (MAP_TO_SPACE.has(cp)) {
      mapped += ' ';
      continue;
    }
    mapped += ch;
  }

  // Step 2 — Normalization to NFKC (RFC 4013 §2.2).
  const normalized = mapped.normalize('NFKC');

  // Step 3 — Prohibited-output check (RFC 4013 §2.3), collecting code points
  // for the bidi check in one pass.
  const codePoints: number[] = [];
  for (const ch of normalized) {
    const cp = ch.codePointAt(0)!;
    if (_inRanges(cp, PROHIBITED_RANGES)) {
      throw new DriverError(
        `SCRAM: password contains a prohibited code point ${
          _u(cp)
        } (SASLprep/RFC 4013)`,
        { stage: 'saslprep', codePoint: cp },
      );
    }
    codePoints.push(cp);
  }

  // Step 4 — Bidirectional endpoint rule (RFC 4013 §2.4 → RFC 3454 §6).
  if (codePoints.length > 0) {
    const hasRandAl = codePoints.some((cp) =>
      _inRanges(cp, RAND_AL_CAT_RANGES)
    );
    if (hasRandAl) {
      const first = codePoints[0]!;
      const last = codePoints[codePoints.length - 1]!;
      if (
        !_inRanges(first, RAND_AL_CAT_RANGES) ||
        !_inRanges(last, RAND_AL_CAT_RANGES)
      ) {
        throw new DriverError(
          'SCRAM: password fails the bidirectional check — a right-to-left ' +
            'string must begin and end with a right-to-left character ' +
            '(SASLprep/RFC 3454 §6)',
          { stage: 'saslprep', firstCodePoint: first, lastCodePoint: last },
        );
      }
    }
  }

  return normalized;
}
