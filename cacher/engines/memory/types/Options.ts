import type { CacherOptions } from '../../../types/mod.ts';

/**
 * Configuration options for the in-memory cacher.
 *
 * The in-memory cacher doesn't require additional configuration beyond the
 * base cacher options.
 *
 * @extends CacherOptions
 * @see {@link MemoryCacher} The class that uses these options
 * @example
 * ```ts
 * const options: MemoryCacherOptions = {
 *   engine: 'MEMORY',
 *   defaultExpiry: 600 // 10 minutes
 * };
 * ```
 */
export type MemoryCacherOptions = CacherOptions;
