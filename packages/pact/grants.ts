/**
 * @module
 *
 * Serialized-grants codec: the storage form of per-module permission
 * masks is a JSON object of module name → decimal bit-string (bigints
 * cannot ride plain JSON). Deserialization is prototype-pollution-safe:
 * `__proto__` / `constructor` / `prototype` keys in a poisoned stored
 * record are dropped, never honored.
 */

import { PactError } from './errors/mod.ts';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Serialize per-module masks into the storage form.
 *
 * @throws {PactError} `INVALID_GRANTS` when a mask is not a non-negative
 *   bigint.
 */
export function serializeGrants(
  grants: Readonly<Partial<Record<string, bigint>>>,
): string {
  const out: Record<string, string> = {};
  for (const [module, mask] of Object.entries(grants)) {
    if (mask === undefined) continue;
    if (typeof mask !== 'bigint' || mask < 0n) {
      throw new PactError('INVALID_GRANTS', {
        reason: `mask for module '${module}' must be a non-negative bigint`,
      });
    }
    out[module] = mask.toString();
  }
  return JSON.stringify(out);
}

/**
 * Parse the storage form back into per-module masks — the inverse of
 * {@link serializeGrants}.
 *
 * @throws {PactError} `INVALID_GRANTS` on malformed input (not JSON, not
 *   an object, or a mask that is not a decimal string).
 */
export function deserializeGrants(
  serialized: string,
): Partial<Record<string, bigint>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new PactError('INVALID_GRANTS', { reason: 'not valid JSON' });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PactError('INVALID_GRANTS', {
      reason: 'must be a JSON object of module to bit-string',
    });
  }
  const grants: Partial<Record<string, bigint>> = {};
  for (const [module, value] of Object.entries(parsed)) {
    if (FORBIDDEN_KEYS.has(module)) continue;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new PactError('INVALID_GRANTS', {
        reason: `mask for module '${module}' must be a decimal string`,
      });
    }
    grants[module] = BigInt(value);
  }
  return grants;
}
