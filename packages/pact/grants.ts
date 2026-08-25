/**
 * @fileoverview Grants helpers — combine and (de)serialize `module → mask`
 * maps.
 *
 * BigInt masks are not JSON-serializable, so grants embedded in a JWT claim
 * (or any wire format) travel as decimal strings. `serializeGrants` before
 * embedding, `deserializeGrants` after verifying.
 *
 * Every accumulator here is created with `Object.create(null)`, so module
 * names that collide with `Object.prototype` members (`__proto__`,
 * `constructor`, …) are stored and read as plain own properties — a grant
 * keyed `__proto__` round-trips instead of being silently dropped (or
 * poisoning later mask reads with inherited values). [F2]
 *
 * @module
 */

import { PactDefinitionError } from './errors/mod.ts';
import type { PactGrants } from './types/mod.ts';

/**
 * OR-merge any number of grant sets (later sets never *remove* bits —
 * bitmask grants are allow-only). `undefined` entries are skipped, so the
 * common `combineGrants(direct, ...groupGrants)` call needs no guards.
 */
export function combineGrants(
  ...sets: Array<PactGrants | undefined>
): PactGrants {
  // Null-proto accumulator: `combined[module]` must never read an inherited
  // Object.prototype member (e.g. module '__proto__'). [F2]
  const combined: PactGrants = Object.create(null);
  for (const set of sets) {
    if (set === undefined) continue;
    for (const [module, mask] of Object.entries(set)) {
      combined[module] = (combined[module] ?? 0n) | mask;
    }
  }
  return combined;
}

/** Grants → JSON-safe wire form: each BigInt mask as a decimal string. */
export function serializeGrants(grants: PactGrants): Record<string, string> {
  // Null-proto so a '__proto__' module is written as an own property
  // instead of silently vanishing through the prototype setter. [F2]
  const wire: Record<string, string> = Object.create(null);
  for (const [module, mask] of Object.entries(grants)) {
    wire[module] = mask.toString();
  }
  return wire;
}

/**
 * Wire form → grants. Accepts decimal strings (the {@link serializeGrants}
 * output), non-negative integer numbers, or BigInts.
 *
 * @throws {@link PactDefinitionError} (`INVALID_GRANTS`) when a value is
 *   not a non-negative decimal integer (rejects `''`, hex/octal, floats,
 *   and negatives).
 */
export function deserializeGrants(
  input: Record<string, string | number | bigint>,
): PactGrants {
  // Null-proto so a '__proto__' module is written as an own property
  // instead of silently vanishing through the prototype setter. [F2]
  const grants: PactGrants = Object.create(null);
  for (const [module, value] of Object.entries(input)) {
    let mask: bigint;
    if (typeof value === 'bigint') {
      mask = value;
    } else if (typeof value === 'number') {
      // `Number.isSafeInteger` (not `isInteger`): above 2^53 a JS number is
      // already rounded, so `BigInt(value)` would silently encode the wrong
      // mask — reject it and require a decimal string / BigInt for large masks.
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new PactDefinitionError(
          `Grants mask for '${module}' must be a non-negative safe integer ` +
            `(got ${value}) — pass a decimal string or BigInt for larger masks`,
          { code: 'INVALID_GRANTS', module },
        );
      }
      mask = BigInt(value);
    } else if (typeof value === 'string' && /^\d+$/.test(value)) {
      // Strictly decimal — bare `BigInt()` would also accept ''/'  '→0n and
      // '0x1F'/'0o17'/'0b101', none of which this wire format permits. [L5]
      mask = BigInt(value);
    } else {
      throw new PactDefinitionError(
        `Grants mask for '${module}' must be a non-negative decimal integer (got ${
          String(value)
        })`,
        { code: 'INVALID_GRANTS', module },
      );
    }
    if (mask < 0n) {
      throw new PactDefinitionError(
        `Grants mask for '${module}' must be non-negative (got ${mask})`,
        { code: 'INVALID_GRANTS', module },
      );
    }
    grants[module] = mask;
  }
  return grants;
}
