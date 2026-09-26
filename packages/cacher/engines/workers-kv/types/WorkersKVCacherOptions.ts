import type { CacherOptions } from '../../../types/mod.ts';
import type { WorkersKVNamespace } from './WorkersKVNamespace.ts';

/**
 * Configuration options for the Workers KV cacher.
 *
 * `binding` is required. `defaultExpiry` follows KV's own floor: `0` (no
 * expiry) or at least 60 seconds.
 *
 * @extends CacherOptions
 * @see {@link WorkersKVCacher} The class that uses these options
 * @example
 * ```ts ignore
 * // Inside a Worker, where `env.CACHE` is a KV namespace binding.
 * const options: WorkersKVCacherOptions = {
 *   binding: env.CACHE,
 *   defaultExpiry: 600,
 * };
 * ```
 */
export type WorkersKVCacherOptions = CacherOptions & {
  /** The KV namespace binding from the Worker's `env`. Required. */
  binding: WorkersKVNamespace;
};
