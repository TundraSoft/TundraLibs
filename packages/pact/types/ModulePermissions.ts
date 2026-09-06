import type { PermissionBits } from './PermissionBits.ts';

/**
 * Module → permission-name ceiling. The keys ARE the modules: a module
 * exists iff it declares its permission list, so an unknown module cannot
 * be referenced by construction.
 */
export type ModulePermissions<P extends PermissionBits = PermissionBits> =
  Record<string, readonly (keyof P)[]>;
