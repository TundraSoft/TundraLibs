/**
 * Generates a random free port within a specified range.
 *
 * @param min - The minimum port number (default: 1024).
 * @param max - The maximum port number (default: 65535).
 * @returns A random free port number.
 * @throws {RangeError} If the maximum port number is less than the minimum port number.
 */
export const getFreePort = (min = 1024, max = 65535): number => {
  if (max < min) {
    throw new RangeError('Invalid range');
  }
  while (true) {
    const port = Math.floor(Math.random() * (max - min + 1)) + min;
    try {
      const listener = Deno.listen({ port });
      listener.close();
      return port;
    } catch {
      continue;
    }
  }
};
