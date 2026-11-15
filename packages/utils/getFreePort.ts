/**
 * @fileoverview `getFreePort()` — pick a random unused TCP port by
 * trial-binding via `compat/net.listen`.
 *
 * @module
 */

import { listen } from '@tundralibs/compat/net';

// WHATWG Fetch bad ports, less port 0: https://fetch.spec.whatwg.org/#port-blocking
// deno-fmt-ignore
const FETCH_BLOCKED_PORTS = [
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
];

/**
 * Range and exclusions for {@link getFreePort}.
 *
 * Exported (and a `type`, not an `interface`) so it survives `.d.ts`
 * generation — a non-exported interface referenced by an exported function
 * degrades that function's parameter to `never` for consumers resolving via
 * the published declarations.
 */
export type GetFreePortOptions = {
  /** Inclusive lower bound (0–65535). @default 1024 */
  min?: number;
  /** Inclusive upper bound (0–65535, ≥ `min`). @default 65535 */
  max?: number;
  /** Ports to skip even if they fall within the range. @default [] */
  exclude?: number[];
};

/** Thrown by {@link getFreePort} for invalid ranges or exhausted attempts. */
export class PortError extends Error {
  /**
   * Sets `name` to `'PortError'` so the error is identifiable after
   * serialization, where the prototype is lost.
   *
   * @param message - Reason the port lookup failed.
   */
  constructor(message: string) {
    super(message);
    this.name = 'PortError';
  }
}

/**
 * Find a random free TCP port by randomly picking values in `[min, max]`
 * and trial-binding them with `compat/net.listen`. The first port that
 * binds successfully is returned. Ports on the WHATWG Fetch "bad port" list
 * are skipped like `exclude` entries, because `fetch` on Deno and Node refuses
 * to call them.
 *
 * @param options - {@link GetFreePortOptions} controlling range and exclusions.
 * @returns A free port within the requested range.
 *
 * @throws {@link PortError} If the range is invalid, every port is excluded
 *   or blocked by `fetch`, or no free port is found within ~`(max-min+1) * 10`
 *   attempts.
 *
 * @example
 * ```typescript
 * const port = await getFreePort({ min: 3000, max: 3999 });
 * ```
 */
export const getFreePort = async (
  options: GetFreePortOptions = {},
): Promise<number> => {
  // Destructured in the BODY, not the signature — JSR's npm-compat
  // `.d.ts` generation degrades a signature-position destructuring
  // pattern to an unusable `(_dts_1: never)`, even though the pattern
  // is otherwise "fast-check" clean (`deno publish --dry-run` does not
  // catch it — confirmed 2026-08-17 against a real consumer install of
  // utils 1.0.5). A plain named parameter has no pattern to mis-emit.
  const { min = 1024, max = 65535, exclude = [] } = options;

  // Validate input parameters
  if (min < 0 || min > 65535) {
    throw new PortError('Minimum port must be between 0 and 65535');
  }
  if (max < 0 || max > 65535) {
    throw new PortError('Maximum port must be between 0 and 65535');
  }
  if (max < min) {
    throw new PortError('Maximum port must be greater than minimum port');
  }

  // Calculate available range to prevent infinite loops. Dedupe the excluded
  // ports first: counting duplicates could push the tally to/over the range
  // size and wrongly report the range as fully excluded when free ports remain.
  const availableRange = max - min + 1;
  const skipped = new Set([...FETCH_BLOCKED_PORTS, ...exclude]);
  const excludedInRange =
    [...skipped].filter((port) => port >= min && port <= max).length;

  if (excludedInRange >= availableRange) {
    throw new PortError('All ports in range are excluded');
  }

  // Prevent infinite loops by limiting attempts, but be more generous
  const maxAttempts = Math.max(100, Math.min(10000, availableRange * 10));
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    // Use crypto.getRandomValues() for cryptographically secure random port selection
    const randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    const port = min +
      Math.floor(randomArray[0]! / (0xFFFFFFFF + 1) * (max - min + 1));

    // Skip excluded and fetch-blocked ports
    if (skipped.has(port)) {
      continue;
    }

    try {
      const listener = await listen({ port });
      listener.close();
      return port;
    } catch {
      // Port in use or other binding error, continue to next attempt
      // Common reasons: EADDRINUSE (port in use), EACCES (permission denied)
      // We intentionally catch and ignore all errors here as we want to try the next port
      continue;
    }
  }

  // If we get here, we couldn't find a free port within reasonable attempts
  throw new PortError(
    `No free port found in range ${min}-${max} after ${maxAttempts} attempts`,
  );
};
