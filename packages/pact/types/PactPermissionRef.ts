/**
 * @fileoverview Permission-reference type for `@tundralibs/pact`.
 * @module
 */

import type { PactPermissionBits } from './PactPermissionBits.ts';

/**
 * A reference to one permission — by its registry name or its raw bit
 * value.
 *
 * @typeParam P - the permission registry type.
 */
export type PactPermissionRef<
  P extends PactPermissionBits = PactPermissionBits,
> = (keyof P & string) | bigint;
