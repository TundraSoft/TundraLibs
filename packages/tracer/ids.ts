/**
 * @fileoverview Trace and span id generation. The default generator produces
 * W3C-conformant random ids from `crypto.getRandomValues`, which is a global on
 * every supported runtime — so this file carries no dependency at all.
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { randomIdGenerator } from '@tundralibs/tracer';
 *
 * randomIdGenerator.traceId(); // '4bf92f3577b34da6a3ce929d0e0e4736'
 * randomIdGenerator.spanId();  // '00f067aa0ba902b7'
 * ```
 */

import type { IdGenerator } from './types/mod.ts';

/** Byte width of a W3C trace id (32 hex characters). */
const TRACE_ID_BYTES = 16;
/** Byte width of a W3C span id (16 hex characters). */
const SPAN_ID_BYTES = 8;

/** A source of cryptographically random bytes. */
export type RandomBytes = (length: number) => Uint8Array;

/** The runtime's random source — Web Crypto, a global on Deno/Bun/Node. */
const cryptoRandomBytes: RandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));

/**
 * Lowercase hex encoding of `bytes`. Exported for testing; not part of the
 * package's public surface.
 *
 * @internal
 * @param bytes - The bytes to encode.
 * @returns Two lowercase hex characters per byte.
 */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Whether `id` is the all-zero id, which W3C defines as invalid. Exported for
 * testing; not part of the package's public surface.
 *
 * @internal
 * @param id - A lowercase hex id.
 */
export function isZeroId(id: string): boolean {
  return /^0+$/.test(id);
}

/**
 * Build an {@link IdGenerator} over a supplied random source.
 *
 * The random source is injectable so the all-zero rejection path — which is
 * otherwise unreachable at a probability of 1 in 2^128 — stays testable, and
 * so tests can pin ids deterministically.
 *
 * @param randomBytes - Byte source. Defaults to `crypto.getRandomValues`.
 * @returns An {@link IdGenerator} producing W3C-conformant ids.
 */
export function createRandomIdGenerator(
  randomBytes: RandomBytes = cryptoRandomBytes,
): IdGenerator {
  // W3C forbids the all-zero id; draw again rather than emit an invalid one.
  const nonZeroHex = (bytes: number): string => {
    let id = toHex(randomBytes(bytes));
    while (isZeroId(id)) {
      id = toHex(randomBytes(bytes));
    }
    return id;
  };
  return {
    traceId: (): string => nonZeroHex(TRACE_ID_BYTES),
    spanId: (): string => nonZeroHex(SPAN_ID_BYTES),
  };
}

/** The default id generator — random ids from `crypto.getRandomValues`. */
export const randomIdGenerator: IdGenerator = createRandomIdGenerator();
