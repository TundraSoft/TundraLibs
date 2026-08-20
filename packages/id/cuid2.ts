/**
 * @fileoverview cuid2 — cryptographically secure, collision-resistant
 * identifier.
 *
 * Format: a leading lowercase letter followed by `length-1` more
 * lowercase-alphanumeric characters. Default length is 24; valid
 * range is 24..32 (the reference spec's recommendation — shorter than
 * 24 sacrifices collision resistance, longer than 32 is overkill for
 * almost any application).
 *
 * Differences from {@link cuid} (v1):
 * - **Cryptographically secure source** — every character is drawn
 *   from `crypto.getRandomValues`, not `Math.random` or a counter.
 * - **No timestamp segment** — cuid2 is intentionally **not**
 *   time-sortable; the previous timestamp leak was a privacy concern
 *   (`Date.now()` of when the ID was minted is reconstructable from
 *   the prefix). Use {@link https://example/ulid ulid} when you need
 *   creation-time ordering AND a globally-unique ID.
 * - **No `c` prefix** — instead, the leading char is any letter, so
 *   the format is `[a-z][a-z0-9]{length-1}`. Matches the validator
 *   `Guardian.string().cuid2({ length })`.
 *
 * @see {@link https://github.com/paralleldrive/cuid2} Reference spec
 *
 * @module
 *
 * @example
 * ```ts
 * import { cuid2 } from '@tundralibs/id/cuid2';
 *
 * const id  = cuid2();   // 24 chars, e.g. "k3rj9xn8q1p7m2w5y6h4t8d9"
 * const id2 = cuid2(32); // 32 chars
 * ```
 */

import { InvalidOptionError } from './errors/mod.ts';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';

const MIN_LENGTH = 24;
const MAX_LENGTH = 32;
const DEFAULT_LENGTH = 24;

/**
 * Generate a cuid2 — a cryptographically secure, collision-resistant
 * lowercase-alphanumeric identifier.
 *
 * @param length - Total length, default 24. Must be in 24..32; lengths
 *   outside that range throw.
 * @returns A `length`-character cuid2 (`[a-z][a-z0-9]{length-1}`).
 *
 * @throws {@link InvalidOptionError} If `length` is outside the supported range.
 *
 * @example
 * ```ts
 * cuid2();        // "k3rj9xn8q1p7m2w5y6h4t8d9"  (24 chars, default)
 * cuid2(32);      // "k3rj9xn8q1p7m2w5y6h4t8d9a2b3c4d5"  (32 chars)
 * ```
 */
export function cuid2(length: number = DEFAULT_LENGTH): string {
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new InvalidOptionError(
      `cuid2 length must be an integer in ${MIN_LENGTH}..${MAX_LENGTH} (got ${length})`,
      { generator: 'cuid2', option: 'length', value: length },
    );
  }
  // Draw every random byte this ID needs in ONE getRandomValues call instead
  // of one call per character. The buffer is local to this invocation and
  // dropped on return — there is no cross-call pool, so each ID still gets
  // fresh CSPRNG bytes and nothing unused survives for a fork/snapshot to
  // clone. Over-drawing slightly past `length` absorbs the rare rejected byte
  // (see nextIndex) so the refill branch is virtually never taken; it remains
  // as the correctness backstop.
  let buf = crypto.getRandomValues(new Uint8Array(Math.ceil(length * 1.3)));
  let pos = 0;

  // Returns a uniformly distributed integer in `[0, n)` consumed from `buf`.
  // A naive `byte % n` is biased whenever `n` does not divide 256 evenly (the
  // low residues occur more often), so we rejection-sample — skip any byte at
  // or above the largest multiple of `n` that fits in a byte. For `n <= 36`
  // (our alphabets) the rejection rate is tiny (<= ~9%). Refills `buf` in the
  // unlikely event the batch is exhausted by rejections.
  const nextIndex = (n: number): number => {
    const limit = Math.floor(256 / n) * n;
    for (;;) {
      if (pos >= buf.length) {
        buf = crypto.getRandomValues(new Uint8Array(buf.length));
        pos = 0;
      }
      const byte = buf[pos++]!;
      if (byte < limit) return byte % n;
    }
  };

  // First char: a letter. Body: alphanumeric. Initialise `out` as an
  // explicit empty string so TS-strict's `noUncheckedIndexedAccess`
  // doesn't infer `string | undefined` from the first lookup.
  let out = '';
  out += LETTERS[nextIndex(LETTERS.length)];
  for (let i = 1; i < length; i++) {
    out += ALPHA[nextIndex(ALPHA.length)];
  }
  return out;
}
