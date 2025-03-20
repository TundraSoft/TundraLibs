interface GetFreePortOptions {
  min?: number;
  max?: number;
  timeout?: number;
  maxRetries?: number;
  exclude?: number[];
}

export class PortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortError';
  }
}

/**
 * Generates a random free port within a specified range.
 *
 * @param options - Configuration options
 * @param options.min - The minimum port number (default: 1024)
 * @param options.max - The maximum port number (default: 65535)
 * @param options.timeout - Timeout in milliseconds (default: 5000)
 * @param options.maxRetries - Maximum number of retries (default: 100)
 * @param options.exclude - Array of ports to exclude
 * @returns A promise that resolves to a free port number
 * @throws {PortError} If no free port is found or timeout occurs
 */
export const getFreePort = ({
  min = 1024,
  max = 65535,
  exclude = [],
}: GetFreePortOptions = {}): number => {
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

  while (true) {
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
      // Port in use, continue to next attempt
      continue;
    }
  }
};
