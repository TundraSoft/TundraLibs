/**
 * Re-export of the canonical {@link HTTPMethod} union from
 * `@tundralibs/compat/http`. Surfaces it as part of this package's
 * type-only API so consumers can `import type { HTTPMethod } from
 * '@tundralibs/radrouter/types'` without reaching into the compat
 * package directly.
 */
export type { HTTPMethod } from '@tundralibs/compat/http';
