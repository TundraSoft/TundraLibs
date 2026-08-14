/**
 * @fileoverview Base error class for `@tundralibs/crypt/JWT`.
 *
 * `JWTError` is the package's base error and the only error class
 * the JWT module raises. Extends `BaseError` from
 * `@tundralibs/utils` for typed `context`, `${var}` template
 * substitution, cause chains, and JSON serialisation.
 *
 * @module
 */

import { BaseError } from '@tundralibs/utils';
import type { JWTHeader } from '../types/JWTHeader.ts';
import type { JWTPayload } from '../types/JWTPayload.ts';
import { type JWTErrorCode, JWTErrorCodes } from './JWTErrorCodes.ts';

/**
 * Metadata attached to every {@link JWTError}.
 */
export type JWTErrorMeta = {
  /** Standardised JWT error code. */
  code: JWTErrorCode;
  /** Original error code if not in {@link JWTErrorCodes} (for error mapping). */
  originalCode?: string;
  /** JWT header if available for context. */
  header?: JWTHeader;
  /** JWT payload if available for context. */
  payload?: JWTPayload;
  /** Dynamic content for template interpolation. */
  causeMessage?: string;
} & Record<string, unknown>;

/**
 * JWT-specific error class. Auto-maps unknown error codes to
 * `'INVALID_JWT'` (preserving the original code in
 * `context.originalCode`) and interpolates `${causeMessage}` in
 * the message template.
 *
 * @template M - Error metadata type extending {@link JWTErrorMeta}.
 *
 * @example
 * ```ts
 * import { verifyJWT } from '@tundralibs/crypt/JWT';
 *
 * declare const token: string;
 * declare const secret: string;
 *
 * try {
 *   await verifyJWT(token, secret);
 * } catch (e) {
 *   if (e instanceof JWTError && e.context.code === 'EXPIRED_TOKEN') {
 *     // refresh flow
 *   }
 * }
 * ```
 *
 * @example Construction
 * ```ts
 * declare const original: Error;
 *
 * throw new JWTError('EXPIRED_TOKEN');
 * throw new JWTError('INVALID_SIGNATURE', { causeMessage: 'HMAC verification failed' });
 * throw new JWTError('UNKNOWN_ERROR', { causeMessage: original.message }, original);
 * ```
 */
export class JWTError<M extends JWTErrorMeta = JWTErrorMeta>
  extends BaseError<M> {
  /**
   * Build the error from a {@link JWTErrorCodes} key, which selects the
   * message template. The resolved code and everything in `meta` are exposed
   * on `context`.
   *
   * @param code - A code absent from {@link JWTErrorCodes} is kept as `context.originalCode` and replaced with `'INVALID_JWT'`
   * @param meta - Extra context; `causeMessage` fills the `${causeMessage}` slot most templates carry. Omit it and the placeholder is left in `message` verbatim, so supply one whenever the code's template has the slot.
   * @param cause - Underlying error that triggered this one, if any
   */
  constructor(code: JWTErrorCode, meta?: Omit<M, 'code'>, cause?: Error) {
    const context: M = { code, ...meta } as M;
    if (!JWTErrorCodes[code]) {
      context.originalCode = code;
      code = 'INVALID_JWT';
    }
    context.code = code;

    // Handle template interpolation for causeMessage.
    let message = JWTErrorCodes[code];
    if (message.includes('${causeMessage}') && context.causeMessage) {
      message = message.replace(
        '${causeMessage}',
        String(context.causeMessage),
      );
    }

    super(message, context, cause);
    this.name = 'JWTError';
  }
}
