/**
 * @fileoverview JWT module exports.
 *
 * Re-exports JWT functions, types, and error classes for token
 * creation, verification, decoding, and refresh operations.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { issueJWT, verifyJWT, decodeJWT } from '@tundralibs/crypt/JWT';
 *
 * const token = await issueJWT('HS256', { sub: 'user' }, 'secret');
 * const payload = await verifyJWT(token, 'secret');
 * const decoded = decodeJWT(token);
 * ```
 */

export { JWTError, JWTErrorCodes } from './errors/mod.ts';
export { issueJWT } from './issue.ts';
export type {
  JWTAlgorithm,
  JWTHeader,
  JWTIssueOptions,
  JWTPayload,
  JWTVerifyOptions,
} from './types/mod.ts';
export { verifyJWT } from './verify.ts';
export { decodeJWT, JWT_DEFAULT_TYPES, refreshJWT } from './helpers.ts';
export type { RefreshKeyConfig } from './helpers.ts';
export type { ECCurve, SigningKey } from '../sign/mod.ts';
