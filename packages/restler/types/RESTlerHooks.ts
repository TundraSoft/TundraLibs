/**
 * @fileoverview Convenience bag threading the observability hooks — the
 * suite's `Witness` and the per-request `headerProvider` seam — from an
 * application's composition root into a vendor client's constructor. Both
 * are structural: RESTler imports no logging or tracing package, and the
 * matching adapters (`tracer.wrapClient`, `tracer.propagation`) satisfy
 * these shapes without either package knowing the other exists.
 *
 * @module
 */
import type { Witness } from './Witness.ts';
import type { RESTlerHeaderProvider } from './RESTlerHeaderProvider.ts';

/**
 * Convenience bag for threading the observability hooks from the
 * application's composition root through a vendor client's constructor:
 *
 * ```ts
 * import { RESTler, type RESTlerHooks } from '@tundralibs/restler';
 *
 * class GitHubAPI extends RESTler {
 *   public readonly vendor = 'github';
 *   constructor(token: string, hooks: RESTlerHooks = {}) {
 *     super({ baseURL: 'https://api.github.com', auth: { type: 'BEARER', token }, ...hooks });
 *   }
 * }
 * ```
 */
export type RESTlerHooks = {
  /** See {@link Witness}. */
  witness?: Witness;
  /** See {@link RESTlerHeaderProvider}. */
  headerProvider?: RESTlerHeaderProvider;
};
