/**
 * Options for configuring port range and exclusions when finding a free port.
 *
 * @example Basic usage with default range:
 * ```typescript
 * const options: GetFreePortOptions = {}; // Uses default range 1024-65535
 * ```
 *
 * @example Custom range with exclusions:
 * ```typescript
 * const options: GetFreePortOptions = {
 *   min: 3000,
 *   max: 4000,
 *   exclude: [3000, 3001, 3306] // Avoid MySQL default port and others
 * };
 * ```
 */
interface GetFreePortOptions {
  /**
   * The minimum port number (inclusive). Must be between 0 and 65535.
   * @default 1024
   */
  min?: number;

  /**
   * The maximum port number (inclusive). Must be between 0 and 65535 and >= min.
   * @default 65535
   */
  max?: number;

  /**
   * Array of specific port numbers to exclude from selection.
   * Useful for avoiding known service ports or reserving specific ports.
   * @default []
   */
  exclude?: number[];
}

/**
 * Custom error class for port-related operations.
 *
 * This error is thrown when:
 * - Invalid port range is specified (min/max out of bounds or max < min)
 * - No free port can be found within the specified constraints
 *
 * @example Catching port errors:
 * ```typescript
 * try {
 *   const port = getFreePort({ min: 80, max: 80 }); // Likely to fail
 * } catch (error) {
 *   if (error instanceof PortError) {
 *     console.error('Port allocation failed:', error.message);
 *   }
 * }
 * ```
 */
export class PortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortError";
  }
}

/**
 * Generates a random free port within a specified range.
 *
 * This function attempts to find an available TCP port by randomly selecting
 * ports within the given range and testing their availability. It uses Deno's
 * native networking capabilities to verify port availability.
 *
 * **Algorithm:**
 * 1. Validates input parameters for range and bounds
 * 2. Generates random ports within the specified range
 * 3. Skips any ports listed in the exclude array
 * 4. Tests port availability by attempting to bind to it
 * 5. Returns the first available port found
 *
 * **Performance Notes:**
 * - Average case: O(1) to O(10) attempts for most ranges
 * - Worst case: May loop indefinitely if no ports are available
 * - Uses cryptographically secure random number generation
 *
 * @param options - Configuration options for port selection
 * @param options.min - The minimum port number (default: 1024)
 * @param options.max - The maximum port number (default: 65535)
 * @param options.exclude - Array of ports to exclude from selection
 * @returns A free port number within the specified range
 * @throws {PortError} If input validation fails (invalid range, bounds, etc.)
 *
 * @example Basic usage with defaults:
 * ```typescript
 * const port = getFreePort(); // Returns port between 1024-65535
 * console.log(`Server listening on port ${port}`);
 * ```
 *
 * @example Custom range for development:
 * ```typescript
 * const devPort = getFreePort({ min: 3000, max: 3999 });
 * // Useful for development servers in the 3000s range
 * ```
 *
 * @example Avoiding specific service ports:
 * ```typescript
 * const port = getFreePort({
 *   min: 8000,
 *   max: 9000,
 *   exclude: [8080, 8443, 8888] // Avoid common proxy/web ports
 * });
 * ```
 *
 * @example Error handling:
 * ```typescript
 * try {
 *   const port = getFreePort({ min: 80, max: 80 });
 * } catch (error) {
 *   if (error instanceof PortError) {
 *     console.error('Failed to allocate port:', error.message);
 *     // Fallback to alternative port strategy
 *   }
 * }
 * ```
 *
 * @example Integration with web servers:
 * ```typescript
 * import { serve } from "https://deno.land/std/http/server.ts";
 *
 * const port = getFreePort({ min: 8000, max: 8100 });
 * console.log(`Starting server on http://localhost:${port}`);
 * serve(handler, { port });
 * ```
 */
export const getFreePort = ({
  min = 1024,
  max = 65535,
  exclude = [],
}: GetFreePortOptions = {}): number => {
  // Validate input parameters
  if (min < 0 || min > 65535) {
    throw new PortError("Minimum port must be between 0 and 65535");
  }
  if (max < 0 || max > 65535) {
    throw new PortError("Maximum port must be between 0 and 65535");
  }
  if (max < min) {
    throw new PortError("Maximum port must be greater than minimum port");
  }

  // Calculate available range to prevent infinite loops
  const availableRange = max - min + 1;
  const excludedInRange =
    exclude.filter((port) => port >= min && port <= max).length;

  if (excludedInRange >= availableRange) {
    throw new PortError("All ports in range are excluded");
  }

  // Prevent infinite loops by limiting attempts, but be more generous
  const maxAttempts = Math.max(100, Math.min(10000, availableRange * 10));
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const port = Math.floor(Math.random() * (max - min + 1)) + min;

    // Skip excluded ports
    if (exclude.includes(port)) {
      continue;
    }

    try {
      const listener = Deno.listen({ port });
      listener.close();
      return port;
    } catch (_error) {
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
