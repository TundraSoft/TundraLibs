import type { GuardianError } from '../GuardianError.ts';

/**
 * Result tuple for safe parsing operations.
 * Returns [error, data] where only one will be non-null.
 *
 * @template T - The expected output type
 *
 * @example
 * ```ts
 * const [error, data] = schema.safeParse(input);
 * if (error) {
 *   console.error('Validation failed:', error.message);
 * } else {
 *   console.log('Valid data:', data);
 * }
 * ```
 *
 * @since 1.0.0
 */
export type GuardianSafeParseResult<T> = [GuardianError | null, T | undefined];
