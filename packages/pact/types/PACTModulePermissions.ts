/**
 * @fileoverview Module-catalog type for `@tundralibs/pact`.
 * @module
 */

import type { PACTPermissionBits } from './PACTPermissionBits.ts';

/**
 * Module catalog: module name → the permission names applicable to it. When
 * present, enables validation (unknown module / inapplicable permission).
 *
 * @typeParam P - the permission registry type.
 * @example `{ Post: ['READ', 'EDIT', 'DELETE'], Billing: ['READ'] }`
 */
export type PACTModulePermissions<
  P extends PACTPermissionBits = PACTPermissionBits,
> = Record<string, ReadonlyArray<keyof P & string>>;
