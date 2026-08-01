/**
 * @fileoverview Group-resolution hook type for `@tundralibs/pact`.
 *
 * PACT never creates or manages groups — the consumer owns them and supplies
 * this hook; PACT only resolves group grants through it, caches them, and
 * re-syncs periodically (`syncInterval`) or on demand (`syncGroups()`).
 *
 * @module
 */

import type { PACTGrants } from './PACTGrants.ts';

/**
 * Consumer hook that fetches the grants belonging to each requested group.
 * Called lazily the first time an unknown group id appears in a check, and
 * again for cached ids on every sync. Group ids absent from the returned
 * record are treated (and cached) as having no grants.
 *
 * @param groupIds - the group ids/names to resolve
 * @returns group id → its grants (module → mask)
 */
export type GroupResolver = (
  groupIds: string[],
) => Promise<Record<string, PACTGrants>>;
