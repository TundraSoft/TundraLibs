import type { GuardianError } from '../errors/Base.ts';

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
 */
export type GuardianSafeParseResult<T> = [GuardianError | null, T | undefined];
