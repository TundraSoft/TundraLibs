/**
 * @fileoverview `getFreePort()` — pick a random unused TCP port by
 * trial-binding via `compat/net.listen`.
 *
 * @module
 */

import { listen } from '@tundralibs/compat/net';

/** Range and exclusions for {@link getFreePort}. */
interface GetFreePortOptions {
  /** Inclusive lower bound (0–65535). @default 1024 */
  min?: number;
  /** Inclusive upper bound (0–65535, ≥ `min`). @default 65535 */
  max?: number;
  /** Ports to skip even if they fall within the range. @default [] */
  exclude?: number[];
}

/** Thrown by {@link getFreePort} for invalid ranges or exhausted attempts. */
export class PortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortError';
  }
}

/**
 * Find a random free TCP port by randomly picking values in `[min, max]`
 * and trial-binding them with `compat/net.listen`. The first port that
 * binds successfully is returned.
 *
 * @param options - {@link GetFreePortOptions} controlling range and exclusions.
 * @returns A free port within the requested range.
 *
 * @throws {@link PortError} If the range is invalid, every port is excluded,
 *   or no free port is found within ~`(max-min+1) * 10` attempts.
 *
 * @example
 * ```typescript
 * const port = await getFreePort({ min: 3000, max: 3999 });
 * ```
 */
export const getFreePort = async ({
  min = 1024,
  max = 65535,
  exclude = [],
}: GetFreePortOptions = {}): Promise<number> => {
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
  const excludedInRange = new Set(
    exclude.filter((port) => port >= min && port <= max),
  ).size;

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

    // Skip excluded ports
    if (exclude.includes(port)) {
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
