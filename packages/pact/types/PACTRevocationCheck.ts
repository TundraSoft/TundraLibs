/**
 * @fileoverview Verify-time revocation-seam type for `@tundralibs/pact`.
 * @module
 */

import type { JWTPayload } from '@tundralibs/crypt/JWT';

/**
 * Consumer seam consulted on every `PACT.verifyJWT` after the
 * signature/claims check passes. Return `true` to veto the token (PACT
 * throws `TOKEN_REVOKED`) — typically backed by a jti blocklist or a
 * key-rotation watermark. Keeps stateless JWTs revocable without PACT
 * owning a store.
 */
export type PACTRevocationCheck = (
  claims: JWTPayload,
) => boolean | Promise<boolean>;
