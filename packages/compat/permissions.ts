/**
 * @fileoverview Cross-runtime permission probes. On Deno this calls
 * `Deno.permissions.query[Sync]`; on Bun and Node permissions are
 * assumed granted (there's no equivalent gating).
 *
 * @module
 */

import { isDeno } from './runtime.ts';
import { CompatTypeError } from './Error.ts';

/**
 * Outcome of a permission probe. Deno's `'prompt'` state is reported as
 * `'DENIED'` — nothing is granted until it is actually granted.
 */
export type PermissionResponse = 'GRANTED' | 'DENIED';

/** Permission descriptors compat can probe, matching Deno's names. */
export type PermissionName =
  | 'env'
  | 'ffi'
  | 'net'
  | 'read'
  | 'run'
  | 'sys'
  | 'write'
  | 'import';

const VALID_PERMISSIONS: Set<PermissionName> = new Set([
  'env',
  'ffi',
  'net',
  'read',
  'run',
  'sys',
  'write',
  'import',
]);

/**
 * A {@link PermissionName} plus the narrowing field that permission
 * accepts — `variable` for `env`, `host` for `net`, `path` for the
 * filesystem and `ffi` grants. Omitting the field probes the whole
 * permission rather than one resource.
 *
 * @typeParam T - The permission described; picks the legal extra field.
 */
export type PermissionObject<T extends PermissionName = PermissionName> =
  & {
    name: T;
  }
  & (T extends 'env' ? { variable?: string }
    : T extends 'ffi' ? { path?: string | URL }
    : T extends 'net' ? { host?: string }
    : T extends 'read' | 'write' | 'run' ? { path?: string | URL }
    : never);

/**
 * Query a permission. On Deno returns the actual state; on Bun/Node
 * always returns `'GRANTED'`.
 *
 * @throws {@link CompatTypeError} On unknown permission names.
 */
export const getPermissions: (
  options: PermissionObject,
) => Promise<PermissionResponse> = (
  options: PermissionObject,
): Promise<PermissionResponse> => {
  if (!VALID_PERMISSIONS.has(options.name)) {
    throw new CompatTypeError(`Invalid permission name: ${options.name}`);
  }
  /* c8 ignore start */
  if (isDeno) {
    return Deno.permissions.query(options).then((status: { state: string }) => {
      return status.state === 'granted' ? 'GRANTED' : 'DENIED';
    });
  } else {
    return Promise.resolve('GRANTED');
  }
  /* c8 ignore stop */
};

/** Synchronous {@link getPermissions}. */
export const getPermissionsSync: (
  options: PermissionObject,
) => PermissionResponse = (options: PermissionObject): PermissionResponse => {
  if (!VALID_PERMISSIONS.has(options.name)) {
    throw new CompatTypeError(`Invalid permission name: ${options.name}`);
  }
  /* c8 ignore start */
  if (isDeno) {
    const status = Deno.permissions.querySync(options);
    return status.state === 'granted' ? 'GRANTED' : 'DENIED';
  } else {
    return 'GRANTED';
  }
  /* c8 ignore stop */
};

/** Boolean form of {@link getPermissions}. */
export const hasPermission: (
  options: PermissionObject,
) => Promise<boolean> = (options: PermissionObject): Promise<boolean> =>
  getPermissions(options).then((response) => response === 'GRANTED');

/** Boolean form of {@link getPermissionsSync}. */
export const hasPermissionSync: (options: PermissionObject) => boolean = (
  options: PermissionObject,
): boolean => getPermissionsSync(options) === 'GRANTED';
