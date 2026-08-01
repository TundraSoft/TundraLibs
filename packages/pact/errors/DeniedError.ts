/**
 * @fileoverview Authorization-denied error for `@tundralibs/pact`.
 * @module
 */

import { PactError } from './Base.ts';
import type { PactErrorCode } from './PactErrorCodes.ts';

/**
 * Authorization denied — a principal lacks a required permission. Thrown by
 * {@link Permissions.assert}; callers catch `PactDeniedError` to convert a
 * denial into a 403 (distinct from {@link PactDefinitionError} config bugs).
 */
export class PactDeniedError extends PactError<
  { code: PactErrorCode; module: string; permission: string }
> {
  constructor(module: string, permission: string, cause?: Error) {
    super(
      `Permission '${permission}' denied on module '${module}'`,
      { code: 'PERMISSION_DENIED', module, permission },
      cause,
    );
  }
}
