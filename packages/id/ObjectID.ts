/**
 * @fileoverview MongoDB-Style ObjectID Generator
 *
 * Generates unique identifiers similar to MongoDB's ObjectId format, providing
 * a distributed-friendly ID generation system that embeds timestamp, machine,
 * process, and counter information for enhanced uniqueness and traceability.
 *
 * @author TundraSoft
 *
 * @module
 *
 * **Security note:** this is a *traceable* identifier, not an unguessable
 * token. It embeds a timestamp, a stable per-process machine/process/worker
 * prefix, and a sequential counter, all largely predictable. Do **not** use it
 * for session tokens, password-reset links, API keys, or anything where the
 * value must be hard to guess — use {@link nanoID} (or another CSPRNG-backed
 * generator) for those.
 *
 * @example
 * ```typescript
 * import { ObjectID } from './ObjectID.ts';
 *
 * // Create an ObjectID generator with default settings
 * const generateId = ObjectID();
 * const id1 = generateId(); // e.g. "65a1b2c3019aB30c1f4q000001"
 * const id2 = generateId(); // counter increments: "...000002"
 *
 * // Create with custom counter and machine ID
 * const customGen = ObjectID(1000, "srv");
 * const customId = customGen(); // Uses "srv" as machine identifier
 * ```
 */
import { getProcessId } from '@tundralibs/compat/runtime';
import { ALPHA_NUMERIC, nanoID } from './nanoID.ts';
import { InvalidOptionError } from './errors/mod.ts';

/**
 * Creates a MongoDB-style ObjectID generator function.
 *
 * The IDs are inspired by MongoDB's ObjectId but are **not** the canonical
 * 24-char hex format. The output is a mixed-radix string whose total length is
 * `23 + machineIdLength` characters (26 with the default `machineIdLength = 3`),
 * composed of, in order:
 * - 8 chars: Unix timestamp in seconds, **hex** (zero-padded)
 * - 3 chars: Millisecond-within-second, **decimal** digits (000-999)
 * - `machineIdLength` chars: Machine identifier — auto-generated from the
 *   mixed-case {@link ALPHA_NUMERIC} alphabet (`a-z0-9A-Z`), or the literal
 *   string you pass (whose length then drives the total length)
 * - 4 chars: Process identifier (`getProcessId() % 65536`), **hex**
 * - 2 chars: Worker identifier — random {@link ALPHA_NUMERIC}, per-generator
 * - 6 chars: Incrementing counter, **decimal** digits (zero-padded)
 *
 * Because the segments use different radixes (hex, decimal, and a 62-symbol
 * alphabet) the result is not a uniform hex string.
 *
 * **Security note:** the embedded timestamp, stable prefix, and sequential
 * counter make these IDs predictable. They are traceable identifiers, not
 * unguessable tokens — never use them where the value must be hard to guess.
 *
 * @param counter - Initial counter value for uniqueness (default: 0). Must be a
 *   non-negative integer.
 * @param machineId - Machine identifier string. If not provided, auto-generated
 * @param machineIdLength - Length of auto-generated machine ID (default: 3).
 *   Must be a positive integer. Ignored when an explicit `machineId` is given.
 * @returns A function that generates unique ObjectID strings
 *
 * @throws {@link InvalidOptionError} If counter is negative or not an integer
 *   (NaN, a fractional value, or Infinity)
 * @throws {@link InvalidOptionError} If machineIdLength is less than 1 or not an
 *   integer (NaN, a fractional value, or Infinity). Only validated on the
 *   auto-generate path — when an explicit `machineId` is given the value is
 *   ignored and therefore not checked (see the `machineIdLength` param).
 *
 * @example
 * ```typescript
 * // Basic usage with defaults (26-char output)
 * const genId = ObjectID();
 * const id1 = genId(); // e.g. "65a1b2c3019aB30c1f4q000001"
 *
 * // Custom counter and machine ID
 * const serverGen = ObjectID(5000, "web");
 * const serverId = serverGen(); // Uses "web" as machine identifier
 *
 * // Auto-generated machine ID with custom length (28-char output)
 * const longMachineGen = ObjectID(0, undefined, 5);
 * const longId = longMachineGen(); // Uses 5-character machine ID
 * ```
 */
export function ObjectID(
  counter: number = 0,
  machineId?: string,
  machineIdLength: number = 3,
): () => string {
  if (counter < 0) {
    throw new InvalidOptionError('Counter cannot be negative', {
      generator: 'ObjectID',
      option: 'counter',
      value: counter,
    });
  }

  // Reject NaN / fractional / Infinity counters up front. They slip past
  // `counter < 0` (NaN compares false both ways; fractional/Infinite are >= 0)
  // and then render a malformed counter segment — `(NaN + 1) % 1_000_000`
  // stringifies to a literal "NaN" and `3.7` to "4.7" — silently breaking the
  // documented all-decimal-digits, fixed-width contract.
  if (!Number.isInteger(counter)) {
    throw new InvalidOptionError('Counter must be an integer', {
      generator: 'ObjectID',
      option: 'counter',
      value: counter,
    });
  }

  // `machineIdLength` drives ONLY the auto-generated machine segment. When an
  // explicit (truthy) `machineId` is supplied, the `machineId || nanoID(...)`
  // short-circuit below never evaluates `nanoID(machineIdLength, ...)`, so the
  // value is genuinely unused — and, per the documented "ignored when an
  // explicit `machineId` is given" contract, it is validated ONLY on the
  // auto-generate path. Validating it unconditionally would reject inputs the
  // JSDoc promises to ignore (e.g. `ObjectID(0, 'srv', 2.5)`). The `if (machineId)`
  // guard mirrors the `||` short-circuit exactly: a falsy `machineId` (including
  // `''`) falls through to auto-generation, where the length must be valid.
  let cachedMachineId: string;
  if (machineId) {
    cachedMachineId = machineId;
  } else {
    if (machineIdLength < 1) {
      throw new InvalidOptionError('Machine ID length must be at least 1', {
        generator: 'ObjectID',
        option: 'machineIdLength',
        value: machineIdLength,
      });
    }

    // Reject NaN / fractional / Infinity machineIdLength up front. They slip
    // past `machineIdLength < 1` and reach `nanoID(machineIdLength, ...)`, where
    // NaN silently yields an empty machine segment (a short ID), a fractional
    // value rounds to the wrong width, and Infinity leaks a raw RangeError —
    // bypassing the InvalidOptionError contract and the documented fixed length.
    if (!Number.isInteger(machineIdLength)) {
      throw new InvalidOptionError('Machine ID length must be an integer', {
        generator: 'ObjectID',
        option: 'machineIdLength',
        value: machineIdLength,
      });
    }

    // Generate machine ID only once and cache it
    cachedMachineId = nanoID(machineIdLength, ALPHA_NUMERIC);
  }

  // Cache process ID as it won't change
  const processId = ((getProcessId() ?? 0) % 65536).toString(16).padStart(
    4,
    '0',
  );

  let currentCounter = counter;

  // For collision resistance, add a worker ID that's unique in the process
  const workerId = nanoID(2, ALPHA_NUMERIC);

  return () => {
    // Wrap the counter at the 6-digit field width (000000-999999) so the
    // rendered segment — and therefore the total ID length — stays fixed.
    // (Using MAX_SAFE_INTEGER let the counter reach 7+ digits and silently
    // grow the ID past its documented width.)
    currentCounter = (currentCounter + 1) % 1_000_000;

    // Get current timestamp with higher precision (milliseconds)
    const timestampMs = Date.now();
    const timestamp = Math.floor(timestampMs / 1000);

    // Include millisecond component for better precision
    const milliseconds = (timestampMs % 1000).toString().padStart(3, '0');

    // Format timestamp as an 8-character hex string. `slice(-8)` bounds the
    // width from above the way the counter wrap (above) bounds it: once
    // epoch-seconds exceed 0xFFFFFFFF (2106-02-07) an un-truncated render
    // would spill to 9 chars and widen the whole ID. Keeping the low 32 bits
    // preserves the fixed width (sort-order breaks at that horizon, but the
    // length invariant holds — matching cuid.ts's timestamp handling).
    const timestampHex = timestamp.toString(16).padStart(8, '0').slice(-8);

    // Format counter as 6-character string (increased from 4)
    const counterStr = currentCounter.toString().padStart(6, '0');

    // Combine components into a string with improved entropy
    return `${timestampHex}${milliseconds}${cachedMachineId}${processId}${workerId}${counterStr}`;
  };
}
