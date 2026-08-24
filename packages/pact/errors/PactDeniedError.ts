/**
 * @fileoverview Authorization-denied error for `@tundralibs/pact`.
 * @module
 */

import { PactError } from './Base.ts';
import type { PactErrorCode } from './PactErrorCodes.ts';

/**
 * Authorization denied — a principal lacks a required permission. Thrown by
 * {@link Permissions.assert} / `Pact.assert`; callers catch
 * `PactDeniedError` to convert a denial into a 403 (distinct from
 * {@link PactDefinitionError} config bugs).
 */
export class PactDeniedError extends PactError<
  { code: PactErrorCode; module: string; permission: string }
> {
  /**
   * Build a denial for `permission` on `module`. Both are carried in the
   * error data as well as the message, so a catch site can render or log
   * the denial without re-parsing it.
   *
   * @param permission - human label: a permission name, or `0b…` when the
   *   check was made against a raw bit.
   */
  constructor(module: string, permission: string, cause?: Error) {
    super(
      `Permission '${permission}' denied on module '${module}'`,
      { code: 'PERMISSION_DENIED', module, permission },
      cause,
    );
  }
}
