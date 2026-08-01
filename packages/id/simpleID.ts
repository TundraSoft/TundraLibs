/**
 * @fileoverview Simple Date-Based Sequential ID Generator
 *
 * Generates human-readable sequential IDs based on the current date and an
 * incrementing counter. Perfect for applications requiring date-traceable
 * identifiers like invoices, orders, or daily sequences.
 *
 * ## Uniqueness scope
 *
 * `simpleID()` returns a closure that owns its own counter. The counter is
 * **not** shared across calls to `simpleID()` and **not** shared across
 * processes. To produce a single non-colliding daily sequence:
 *
 * - Create exactly one generator per logical sequence at module load and
 *   reuse it for every ID in that sequence. Two generators with the same
 *   `seed` will produce identical IDs.
 * - Run a single producer process per sequence. There is no cross-process
 *   coordination, so two processes generating "today's invoices" with
 *   `simpleID()` will each produce `YYYYMMDD0001`, `YYYYMMDD0002`, …
 *   independently and collide.
 *
 * For distributed scenarios, use {@link ulid} (sortable, 128-bit) or
 * {@link ObjectID} (machine-discriminated). For a database-backed
 * monotonic primary key, prefer {@link sequenceID} but read its
 * uniqueness caveats first.
 *
 * Within a single generator on a single JS runtime, increments are safe:
 * JS is single-threaded inside one VM context, so calls cannot race.
 *
 * ## Counter width is a floor, not a fixed width
 *
 * `minLen` sets the *minimum* number of digits in the counter component, so the
 * ID is at least `YYYYMMDD` + `minLen` digits wide. It is **not** a fixed width:
 * once the counter exceeds `minLen` digits (e.g. the 10000th ID of the day with
 * the default `minLen = 4`) the counter — and therefore the whole ID — grows by
 * a digit. Size `minLen` for the largest daily volume you expect if you need a
 * stable width.
 *
 * ## The `includeMicroseconds` component is a disambiguator, not real microseconds
 *
 * The underlying clock is millisecond-resolution (`Date.now()`); the 6-digit
 * component is `Date.now() * 1000` plus a small in-process counter, so it does
 * **not** carry true microsecond precision and the low three digits are not a
 * real sub-millisecond reading. It exists only to add intra-millisecond
 * variation; it can repeat under heavy load within the same millisecond. For
 * genuinely sortable, high-resolution, distributed IDs use {@link ulid}.
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { simpleID } from './simpleID.ts';
 *
 * // Basic daily sequence — create ONCE at module scope, reuse forever
 * const dailySeq = simpleID();
 * const id1 = dailySeq(); // 202412260001n (YYYYMMDD + >=4-digit counter)
 * const id2 = dailySeq(); // 202412260002n
 *
 * // With a sub-millisecond disambiguator component (not true microseconds)
 * const preciseSeq = simpleID(0, 4, true);
 * const preciseId = preciseSeq(); // 20241226123456789012n
 * ```
 */

import { InvalidOptionError } from './errors/mod.ts';

/**
 * Upper bound for {@link simpleID}'s `minLen` zero-pad width — a deliberate
 * *sanity* cap, **not** the engine's technical maximum.
 *
 * The real failure thresholds are astronomically large and engine-specific.
 * The hot path is `BigInt(<8-digit date> + counter.padStart(minLen, '0'))`, and
 * each half fails at a different point:
 * - `padStart` throws a raw `RangeError` ("Invalid string length") only once
 *   `minLen` exceeds the engine's max string length (~536,870,888 on V8; higher
 *   on JSC/Bun).
 * - `BigInt(...)` of the padded digit string throws even *earlier* on some
 *   engines — JSC/Bun caps a BigInt at roughly ~313,000 digits ("Out of memory:
 *   BigInt ... too big"), well before its `padStart` limit — so the smallest
 *   real cross-runtime failure point is ~3.1e5, not the ~5.4e8 `padStart` bound.
 *
 * A `minLen` anywhere near either limit has no legitimate use: 10^256 IDs in a
 * single day is already beyond astronomical, and no realistic daily volume
 * needs a pad wider than a couple of dozen digits. {@link MAX_MIN_LEN} is
 * therefore set far below every engine's failure point. This is an intentional
 * policy bound — it (a) guarantees the documented {@link InvalidOptionError} at
 * construction instead of a raw `RangeError` deferred to the first generation
 * call, on *every* runtime and future engine version rather than only the one
 * with the largest limit; (b) keeps generation cheap (a 256-digit BigInt is
 * trivial); and (c) makes behavior consistent across runtimes. Finite integer
 * values in `(256, engine-limit)` that some engines would technically accept
 * are rejected on purpose, not by accident.
 */
const MAX_MIN_LEN = 256;

/**
 * Builds the `yyyyMMdd` day key from a date's **local** components.
 *
 * Replaces a per-emission `@std/datetime` `format()` call — which parses
 * its format string on every invocation — with direct
 * `getFullYear`/`getMonth`/`getDate` string building. On the hot ID path
 * this is the cheap equivalent (and matches how the tests compute the
 * expected day segment).
 *
 * @param date - The date to render.
 * @returns The zero-padded `yyyyMMdd` day string.
 *
 * @internal
 */
const formatDay = (date: Date): string =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${
    String(date.getDate()).padStart(2, '0')
  }`;

/**
 * Creates a date-based sequential ID generator.
 *
 * Generates BigInt IDs composed of:
 * - Date component: YYYYMMDD format (8 digits)
 * - Sub-millisecond disambiguator: Optional 6-digit component (see note below)
 * - Counter component: Zero-padded incrementing number (minimum `minLen` digits)
 *
 * The counter automatically resets to 0 at the start of each new day,
 * ensuring predictable daily sequences.
 *
 * @param seed - Initial counter value (default: 0). Must be an integer;
 *   negative integers are clamped to 0, but NaN, fractional, or Infinite
 *   values are rejected (they would otherwise crash `BigInt()` at generation
 *   time).
 * @param minLen - Minimum digits in the counter component (default: 4). Must be
 *   an integer between 1 and 256. This is a floor, not a fixed width: the
 *   counter (and the whole ID) grows once the value exceeds `minLen` digits.
 * @param includeMicroseconds - Whether to include the 6-digit sub-millisecond
 *   disambiguator (default: false). Despite the name this is **not** true
 *   microsecond precision — the clock is millisecond-resolution and the
 *   component can repeat within a millisecond. See the module docs.
 * @returns Generator function that produces date-based sequential IDs
 *
 * @throws {@link InvalidOptionError} If minLen is less than 1, greater than 256,
 *   or not an integer (NaN, a fractional value, or Infinity). A NaN or
 *   fractional minLen is **not** silently accepted (which would emit a
 *   below-minimum counter), and an out-of-range value throws this typed error
 *   rather than a raw RangeError at generation time.
 * @throws {@link InvalidOptionError} If seed is not a safe integer (NaN, a
 *   fractional value, or Infinity)
 *
 * @example
 * ```typescript
 * // Daily invoice numbers (YYYYMMDD + >=4-digit counter)
 * const invoiceGen = simpleID(1000, 4);
 * const invoice1 = invoiceGen(); // 202412261001n
 * const invoice2 = invoiceGen(); // 202412261002n
 *
 * // Order numbers with longer counter
 * const orderGen = simpleID(0, 6);
 * const order1 = orderGen(); // 20241226000001n
 * const order2 = orderGen(); // 20241226000002n
 *
 * // With the sub-millisecond disambiguator (not true microseconds)
 * const logGen = simpleID(0, 3, true);
 * const logId = logGen(); // 20241226143052789123n
 * //                         YYYYMMDD + 6-digit disambiguator + counter
 *
 * // Next day automatically resets counter
 * // (assuming date changes)
 * const nextDayId = invoiceGen(); // 202412270001n (counter reset)
 * ```
 */
export const simpleID = (
  seed = 0,
  minLen = 4,
  includeMicroseconds = false,
): () => bigint => {
  if (minLen < 1) {
    throw new InvalidOptionError('Minimum length must be at least 1', {
      generator: 'simpleID',
      option: 'minLen',
      value: minLen,
    });
  }

  // Reject NaN / fractional / Infinity minLen the same way the seed is guarded
  // below (this was the F1 sibling miss). NaN slips past `minLen < 1` (NaN
  // compares false both ways) and would silently emit a below-minimum 1-digit
  // counter; a fractional value passes `< 1` too and silently narrows the
  // counter; Infinity passes `< 1` and then leaks a raw RangeError out of
  // `padStart` at generation time — all bypassing the InvalidOptionError
  // contract.
  if (!Number.isInteger(minLen)) {
    throw new InvalidOptionError('Minimum length must be an integer', {
      generator: 'simpleID',
      option: 'minLen',
      value: minLen,
    });
  }

  // Cap the pad width so a finite-but-huge integer (e.g. `1e10`) is rejected
  // with the typed error at construction instead of deferring a raw `RangeError`
  // to the first generation call — from `padStart`, or, on engines with a lower
  // BigInt ceiling (JSC/Bun), from `BigInt()`. The cap is a conservative sanity
  // bound far below every engine's failure point, not the technical maximum;
  // see {@link MAX_MIN_LEN}.
  if (minLen > MAX_MIN_LEN) {
    throw new InvalidOptionError(
      `Minimum length must not exceed ${MAX_MIN_LEN}`,
      {
        generator: 'simpleID',
        option: 'minLen',
        value: minLen,
      },
    );
  }

  // Reject NaN / fractional / Infinity seeds up front. The Math.max clamp below
  // only tames *negative integers*; a non-integer seed would survive it and
  // render into the digit string ('NaN', '3.5'), making BigInt() throw a raw
  // SyntaxError at generation time — bypassing the InvalidOptionError contract.
  if (!Number.isInteger(seed)) {
    throw new InvalidOptionError('Seed must be an integer', {
      generator: 'simpleID',
      option: 'seed',
      value: seed,
    });
  }

  // Clamp negative integers to 0 (as sequenceID does): a negative starting
  // counter would render a '-' into the digit string and make BigInt() throw.
  let currentSeed = Math.max(0, seed);
  let dtno = formatDay(new Date());

  // Sub-millisecond disambiguator component when enabled. The clock is only
  // millisecond-resolution, so this is Date.now() (ms) * 1000 plus an
  // in-process counter — NOT a true microsecond reading. It only adds
  // intra-millisecond variation and can repeat under heavy load.
  let lastMicroTime = 0;
  let microCounter = 0;
  // Recomputed on each call below when includeMicroseconds is set, and stays
  // '' otherwise — no initial value is needed (the first emit overwrites it).
  let microTime = '';

  /**
   * Generates the next ID in the daily sequence.
   *
   * @returns A BigInt ID combining date, optional microseconds, and counter
   *
   * @example
   * ```typescript
   * const gen = simpleID(100, 4, false);
   * const id1 = gen(); // 20241226100n
   * const id2 = gen(); // 20241226101n
   * ```
   */
  return () => {
    const now = new Date();

    // Check if we've entered a new day - reset counter if so. Building the
    // day key directly from the date's components ({@link formatDay}) keeps
    // this off the expensive @std/datetime format() path.
    const currentDate = formatDay(now);
    if (dtno !== currentDate) {
      dtno = currentDate;
      currentSeed = 0; // Reset counter for new day
    }

    // Update microsecond precision for each call when enabled
    if (includeMicroseconds) {
      const currentMicroTime = Date.now() * 1000;
      // If we're still in the same microsecond as last time, increment counter
      if (currentMicroTime === lastMicroTime) {
        microCounter = (microCounter + 1) % 1000;
      } else {
        microCounter = 0;
        lastMicroTime = currentMicroTime;
      }
      microTime = String((currentMicroTime + microCounter) % 1000000).padStart(
        6,
        '0',
      );
    }

    currentSeed++; // Increment counter after potential reset
    const cnt = String(currentSeed).padStart(minLen, '0');

    // Combine components: date + [microseconds] + counter
    return BigInt(`${dtno}${includeMicroseconds ? microTime : ''}${cnt}`);
  };
};
