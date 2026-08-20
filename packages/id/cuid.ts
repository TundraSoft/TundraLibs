/**
 * @fileoverview cuid v1 — collision-resistant identifier.
 *
 * 25-character identifier with format:
 *
 * ```
 * c + 8 chars timestamp + 4 chars counter + 4 chars fingerprint + 8 chars random
 * └─┘   └────────────┘   └────────┘        └────────────┘        └──────────┘
 *  1            8              4                  4                    8     = 25
 * ```
 *
 * All segments encode to lowercase base36 (`0-9` + `a-z`). The leading
 * `c` is the canonical cuid prefix — distinguishes the format at a
 * glance and avoids ambiguity with raw base36 strings.
 *
 * Properties:
 * - **Sortable by creation order** (timestamp is the high-order segment).
 * - **Roughly collision-resistant** within a single process — the
 *   per-process counter rolls over after 36^4 = 1.6M IDs, after which
 *   the random tail carries the burden. Use {@link cuid2} for
 *   cryptographically-resistant collision properties.
 * - **URL- and shell-safe** — letters + digits only, no special
 *   characters.
 *
 * Pairs with `Guardian.string().cuid()` from the guardian package,
 * which validates the same 25-char `c[a-z0-9]{24}` format.
 *
 * @see {@link https://github.com/paralleldrive/cuid} Reference spec
 *
 * @module
 *
 * @example
 * ```ts
 * import { cuid } from '@tundralibs/id/cuid';
 *
 * const id = cuid(); // e.g. "clrwk6yt40001qz2ek6f7r2t1"
 * ```
 */

const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = ALPHA.length; // 36

const TIME_LEN = 8;
const COUNTER_LEN = 4;
const FINGERPRINT_LEN = 4;
const RANDOM_LEN = 8;

/** Per-process counter; rolls at COUNTER_LEN base36 digits. */
let counter = 0;
const COUNTER_MAX = BASE ** COUNTER_LEN; // 36^4 = 1_679_616

/** Per-process fingerprint, computed lazily on first call. */
let fingerprint: string | undefined;

/**
 * Generate a 25-character cuid (v1) — collision-resistant, sortable,
 * URL-safe identifier.
 *
 * @returns A 25-character cuid (`c` + 24 base36 chars).
 *
 * @example
 * ```ts
 * const id = cuid();
 * // → "clrwk6yt40001qz2ek6f7r2t1"
 *
 * // Bulk generation — IDs sort lexicographically by creation order.
 * const batch = Array.from({ length: 1000 }, () => cuid());
 * ```
 */
export function cuid(): string {
  const ts = padLeft(Date.now().toString(BASE), TIME_LEN);
  // The timestamp segment can in theory overflow in the year ~2059,
  // when `Date.now()` exceeds 36^8 ms (≈89 years after the 1970 epoch).
  // The slice keeps the low bits and preserves length; sort-order is
  // broken at that point but the format invariant holds.
  const tsFixed = ts.slice(-TIME_LEN);
  const ctr = padLeft(
    (counter = (counter + 1) % COUNTER_MAX).toString(BASE),
    COUNTER_LEN,
  );
  const fp = fingerprint ??= computeFingerprint();
  const rand = randomBase36(RANDOM_LEN);
  return `c${tsFixed}${ctr}${fp}${rand}`;
}

/**
 * Lazy-init fingerprint: a per-process random 4-char base36 string.
 * Used to disambiguate cuids generated in different processes that
 * happen to share a timestamp + counter value.
 *
 * @internal
 */
function computeFingerprint(): string {
  return randomBase36(FINGERPRINT_LEN);
}

/**
 * `length` random base36 chars drawn from `crypto.getRandomValues`.
 *
 * A naive `byte % 36` is biased — 256 mod 36 = 4, so residues 0..3 are
 * slightly favoured. We rejection-sample (discard bytes at or above the
 * largest multiple of 36 that fits in a byte, i.e. 252) so every base36
 * digit is equally likely. The rejection rate is ~1.6% so this is fast.
 *
 * All bytes are drawn in a single `getRandomValues` call rather than one call
 * per character. The buffer is local to this call and dropped on return — no
 * cross-call pool, so each segment still gets fresh CSPRNG bytes and nothing
 * unused persists. The `+ 4` over-draw absorbs the rare rejected byte so the
 * refill branch is virtually never taken; it stays as the correctness backstop.
 *
 * @internal
 */
function randomBase36(length: number): string {
  const limit = Math.floor(256 / BASE) * BASE; // 252
  let buf = crypto.getRandomValues(new Uint8Array(length + 4));
  let pos = 0;
  let s = '';
  for (let i = 0; i < length; i++) {
    let byte: number;
    do {
      if (pos >= buf.length) {
        buf = crypto.getRandomValues(new Uint8Array(buf.length));
        pos = 0;
      }
      byte = buf[pos++]!;
    } while (byte >= limit);
    s += ALPHA[byte % BASE];
  }
  return s;
}

/**
 * Left-pad with `0` to the target width. Used to keep each segment
 * fixed-length even when the encoded number is shorter.
 *
 * @internal
 */
function padLeft(s: string, width: number): string {
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}
