/**
 * Configuration options for random number generation
 */
export type RandomNumberOptions = {
  /**
   * Minimum value (inclusive)
   * @default 0
   */
  min?: number;

  /**
   * Maximum value (inclusive)
   * @default 100
   */
  max?: number;

  /**
   * Whether to include floating point decimals
   * @default false
   */
  float?: boolean;

  /**
   * Number of decimal places for floating point numbers
   * @default 16
   */
  precision?: number;
};

/**
 * Generates a cryptographically secure random integer within the specified range.
 *
 * Uses rejection sampling to ensure uniform distribution across the range.
 * This method is slower than naive approaches but guarantees no bias.
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns A random integer between min and max (inclusive)
 *
 * @throws {Error} When min > max or values are not safe integers
 *
 * @example
 * ```typescript
 * const dice = randomInt(1, 6);        // 1-6 inclusive
 * const byte = randomInt(0, 255);      // 0-255 inclusive
 * const coin = randomInt(0, 1);        // 0 or 1
 * ```
 */
export function randomInt(min: number, max: number): number {
  // Validate inputs
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new TypeError('Min and max must be safe integers');
  }

  if (min > max) {
    throw new Error('Min cannot be greater than max');
  }

  if (min === max) {
    return min;
  }

  const range = max - min + 1;

  // For small ranges, use optimized approach
  if (range <= 256) {
    return randomIntSmallRange(min, max, range);
  }

  // For larger ranges, use rejection sampling with multiple bytes
  return randomIntLargeRange(min, max, range);
}

/**
 * Generates a cryptographically secure random floating point number.
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive for floating point)
 * @param precision - Number of decimal places (default: 16)
 * @returns A random float between min and max
 *
 * @example
 * ```typescript
 * const percent = randomFloat(0, 100);           // 0.0 to 99.999...
 * const probability = randomFloat(0, 1);         // 0.0 to 0.999...
 * const precise = randomFloat(0, 1, 6);          // 6 decimal places
 * ```
 */
export function randomFloat(min: number, max: number, precision = 16): number {
  if (min >= max) {
    throw new Error('Min must be less than max for floating point numbers');
  }

  // Generate a random fraction with high precision
  const fraction = generateSecureRandomFraction(precision);

  // Scale to the desired range
  const result = min + fraction * (max - min);

  // Round to the specified precision
  const multiplier = Math.pow(10, precision);
  return Math.round(result * multiplier) / multiplier;
}

/**
 * Generates a random number with flexible options.
 *
 * @param options - Configuration options for random generation
 * @returns A random number according to the specified options
 *
 * @example
 * ```typescript
 * const intInRange = randomNumber({ min: 10, max: 20 });
 * const floatInRange = randomNumber({ min: 0, max: 1, float: true });
 * const preciseDrunk = randomNumber({ min: 0, max: 100, float: true, precision: 2 });
 * ```
 */
export function randomNumber(options: RandomNumberOptions = {}): number {
  const {
    min = 0,
    max = 100,
    float = false,
    precision = 16,
  } = options;

  if (float) {
    return randomFloat(min, max, precision);
  } else {
    return randomInt(min, max);
  }
}

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * Generates random integers for small ranges (≤ 256) using single byte
 */
function randomIntSmallRange(min: number, _max: number, range: number): number {
  const maxValid = Math.floor(256 / range) * range - 1;

  let randomValue: number;
  do {
    const randomByte = new Uint8Array(1);
    crypto.getRandomValues(randomByte);
    randomValue = randomByte[0]!;
  } while (randomValue > maxValid);

  return min + (randomValue % range);
}

/**
 * Generates random integers for large ranges using rejection sampling
 */
function randomIntLargeRange(min: number, _max: number, range: number): number {
  // Calculate required bytes for the range
  const bitsNeeded = Math.ceil(Math.log2(range));
  const bytesNeeded = Math.ceil(bitsNeeded / 8);
  const maxValue = 2 ** (bytesNeeded * 8);
  const maxValid = Math.floor(maxValue / range) * range - 1;

  let randomValue: number;
  do {
    const randomBytes = new Uint8Array(bytesNeeded);
    crypto.getRandomValues(randomBytes);

    // Convert bytes to number
    randomValue = 0;
    for (let i = 0; i < bytesNeeded; i++) {
      randomValue = (randomValue << 8) + (randomBytes[i] ?? 0);
    }
  } while (randomValue > maxValid);

  return min + (randomValue % range);
}

/**
 * Generates a cryptographically secure random fraction between 0 and 1
 */
function generateSecureRandomFraction(precision: number): number {
  // Use enough bytes to ensure the requested precision
  const bytesNeeded = Math.ceil(precision * Math.log(10) / Math.log(256));
  const randomBytes = new Uint8Array(bytesNeeded);
  crypto.getRandomValues(randomBytes);

  // Convert to fraction
  let fraction = 0;
  let divisor = 1;

  for (let i = 0; i < bytesNeeded; i++) {
    divisor *= 256;
    fraction = fraction * 256 + (randomBytes[i] ?? 0);
  }

  return fraction / divisor;
}
