/**
 * @fileoverview Permission-reference type for `@tundralibs/pact`.
 * @module
 */

import type { PACTPermissionBits } from './PACTPermissionBits.ts';

/**
 * A reference to one permission — by its registry name or its raw bit value.
 *
 * @typeParam P - the permission registry type.
 */
export type PACTPermissionRef<
  P extends PACTPermissionBits = PACTPermissionBits,
> = (keyof P & string) | bigint;
