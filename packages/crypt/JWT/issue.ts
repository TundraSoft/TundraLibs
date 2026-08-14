/**
 * @fileoverview JWT token issuance (creation) functions.
 *
 * Creates JWT tokens following RFC 7519 with HMAC or RSA-PSS signing.
 * Automatically sets issued-at time and validates payload claims.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { issueJWT } from '@tundralibs/crypt/JWT';
 *
 * const token = await issueJWT('HS256', { sub: 'user123' }, 'secret');
 * ```
 */

import { encodeBase64Url } from '@std/encoding';
import { JWTError } from './errors/mod.ts';
import {
  type JWTAlgorithm,
  type JWTHeader,
  type JWTIssueOptions,
  type JWTPayload,
} from './types/mod.ts';
import { signEC, signHMAC, signRSA } from '../sign/mod.ts';
import type { SigningKey } from '../sign/mod.ts';
import {
  algorithmCurve,
  algorithmFamily,
  JWT_ALGORITHM_MAP,
  keyAlgorithmFamily,
  keyCurve,
  rsaScheme,
  toJwtSignature,
  validatePayload,
} from './helpers.ts';

/**
 * Issues (creates) a JWT token with the specified algorithm, payload, and key/secret.
 *
 * Creates a complete JWT following RFC 7519 standards with:
 * - Proper header with algorithm and type (`typ: 'JWT'` by default; pass
 *   `{ typ: 'at+jwt' }` for an RFC 9068 OAuth 2.0 access token)
 * - Validated and normalized payload with automatic `iat` setting
 * - Signature using HMAC (`HS*`), RSA (`RS*`/`PS*`) or ECDSA (`ES*`) algorithms
 * - Base64URL encoding for all components
 *
 * The function automatically sets the `iat` (issued at) claim if not provided
 * and validates all claims for proper format and types.
 *
 * For `ES*` the key is checked against the algorithm before signing: RFC 7518
 * §3.4 binds each ECDSA algorithm to exactly one curve (`ES256`→P-256,
 * `ES384`→P-384, `ES512`→**P-521**), so a non-EC key or a key on the wrong
 * curve is rejected rather than used to mint a token whose header misdescribes
 * its own signature. `HS*` keys are deliberately not shape-checked — an HMAC
 * secret is opaque bytes, and any string is a legal one. Algorithm confusion is
 * defended on the verification side, where the token's `alg` gets a vote.
 *
 * @param algo - Algorithm to use for signing (HS256/384/512 for HMAC,
 *   RS256/384/512 and PS256/384/512 for RSA, ES256/384/512 for ECDSA)
 * @param payload - JWT payload containing claims (will be validated and normalized)
 * @param key - Signing key: a raw secret for HMAC, or a private key for the
 *   asymmetric algorithms. Accepts a PEM string, a `CryptoKey`, or a JWK —
 *   see {@link SigningKey}.
 * @param options - Optional header metadata. A bare string is treated as the
 *   Key ID (`kid`) for backwards compatibility; pass a {@link JWTIssueOptions}
 *   object to also set the `typ` header — e.g. `{ typ: 'at+jwt' }` to mint an
 *   RFC 9068 OAuth 2.0 access token. Defaults to `typ: 'JWT'`.
 *
 * @returns Promise resolving to the complete JWT token as a string
 *
 * @throws {JWTError} INVALID_SECRET - When key is empty or not a string
 * @throws {JWTError} INVALID_PAYLOAD - When payload is not an object
 * @throws {JWTError} INVALID_JWT - When payload contains invalid claim formats
 * @throws {JWTError} INVALID_CLAIMS - When audience claim format is invalid
 * @throws {JWTError} INVALID_HEADER - When `options.typ` is supplied but is not
 *   a non-empty string
 * @throws {JWTError} UNSUPPORTED_ALGORITHM - When `algo` is not a supported
 *   algorithm, or when an `ES*` algorithm is given a non-EC key or a key on a
 *   curve other than the one it binds
 * @throws {JWTError} UNKNOWN_ERROR - When unexpected errors occur during signing
 *
 * @example
 * ```typescript
 * import { generateECDSAKeys } from '@tundralibs/crypt/generators';
 *
 * declare const privateKeyPEM: string;
 * declare const ecPrivateKeyPEM: string;
 *
 * // HMAC JWT with expiration
 * const hmacToken = await issueJWT('HS256', {
 *   sub: 'user123',
 *   exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
 * }, 'my-secret-key');
 *
 * // RSA JWT with private key
 * const rsaToken = await issueJWT('RS256', {
 *   sub: 'user456',
 *   iss: 'auth.example.com',
 *   aud: ['api.example.com', 'web.example.com'],
 *   exp: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
 * }, privateKeyPEM);
 *
 * // JWT with key ID for rotation
 * const keyedToken = await issueJWT('HS512', {
 *   sub: 'service-account',
 * }, 'service-secret', 'key-2024-01');
 *
 * // RFC 9068 OAuth 2.0 access token (typ: 'at+jwt')
 * const accessToken = await issueJWT('RS256', {
 *   sub: 'user123',
 *   iss: 'https://auth.example.com',
 *   aud: 'https://api.example.com',
 *   client_id: 'app-42',
 * }, privateKeyPEM, { typ: 'at+jwt', kid: 'key-2024-01' });
 *
 * // ECDSA JWT — the key must be on P-256 for ES256
 * const ecToken = await issueJWT('ES256', {
 *   sub: 'user789',
 * }, ecPrivateKeyPEM);
 *
 * // The key may also be a CryptoKey or a JWK
 * const { privateKey } = await generateECDSAKeys('P-256');
 * const token2 = await issueJWT('ES256', { sub: 'user789' }, privateKey);
 * ```
 *
 * @see {@link verifyJWT} For JWT verification
 * @see {@link JWTPayload} For payload structure details
 * @see {@link JWTIssueOptions} For header metadata options
 * @see {@link https://tools.ietf.org/html/rfc7519} RFC 7519 - JSON Web Token (JWT)
 * @see {@link https://www.rfc-editor.org/rfc/rfc9068} RFC 9068 - JWT Access Tokens
 */
export const issueJWT = async <T extends JWTPayload = JWTPayload>(
  algo: JWTAlgorithm,
  payload: T,
  key: SigningKey,
  options?: string | JWTIssueOptions,
): Promise<string> => {
  if (
    key === null || key === undefined ||
    (typeof key === 'string' ? key.length === 0 : typeof key !== 'object')
  ) {
    throw new JWTError('INVALID_SECRET', {
      causeMessage:
        'Key must be a non-empty string, a CryptoKey, or a JWK object',
    });
  }

  if (!payload || typeof payload !== 'object') {
    throw new JWTError('INVALID_PAYLOAD', {
      causeMessage: 'Payload must be an object',
    });
  }

  // Validate and normalize payload
  const normalizedPayload = { ...payload };
  validatePayload(normalizedPayload);

  // A bare string keeps the original `kid` positional signature working.
  const { kid, typ }: JWTIssueOptions = typeof options === 'string'
    ? { kid: options }
    : options ?? {};

  if (typ !== undefined && (typeof typ !== 'string' || typ.length === 0)) {
    throw new JWTError('INVALID_HEADER', {
      causeMessage: 'Token type (typ) must be a non-empty string',
    });
  }

  const header: JWTHeader = {
    alg: algo,
    typ: typ ?? 'JWT',
  };

  if (kid) {
    header.kid = kid;
  }

  try {
    const headerBase64 = encodeBase64Url(JSON.stringify(header));
    const payloadBase64 = encodeBase64Url(JSON.stringify(normalizedPayload));
    const data = `${headerBase64}.${payloadBase64}`;

    const hashAlgorithm = JWT_ALGORITHM_MAP[algo];
    if (!hashAlgorithm) {
      throw new JWTError('UNSUPPORTED_ALGORITHM', {
        causeMessage: `Unsupported algorithm: ${algo}`,
        algorithm: algo,
      });
    }

    const family = algorithmFamily(algo);

    let signature: string;
    if (family === 'HMAC') {
      // HMAC signature (HS*). No key-shape check: HMAC keys are opaque bytes,
      // so any string is a legal secret — including one that happens to look
      // like PEM. Algorithm confusion is defended on the *verify* side, where
      // the attacker-controlled `alg` header actually gets a vote.
      signature = await signHMAC(data, key, { hashAlgorithm });
    } else if (family === 'EC') {
      // SECURITY: `ES*` binds one curve (RFC 7518 §3.4), so unlike the other
      // families the key's shape has to be checked before signing. Minting an
      // `ES256` header over a P-384 signature produces a token no conforming
      // verifier can check and invites a lax one to guess; catching it here
      // also turns an opaque Web Crypto import failure into a message that
      // names the mismatch.
      const curve = algorithmCurve(algo);
      const suppliedFamily = keyAlgorithmFamily(key);
      if (suppliedFamily !== 'EC') {
        throw new JWTError('UNSUPPORTED_ALGORITHM', {
          causeMessage: `Algorithm mismatch: '${algo}' needs an EC key but a ` +
            `${suppliedFamily} key was supplied`,
          algorithm: algo,
          keyFamily: suppliedFamily,
          headerFamily: family,
        });
      }
      const supplied = keyCurve(key);
      if (supplied !== curve) {
        throw new JWTError('UNSUPPORTED_ALGORITHM', {
          causeMessage:
            `Curve mismatch: '${algo}' requires an EC key on ${curve} but ` +
            `the supplied key is on ${supplied}`,
          algorithm: algo,
          expectedCurve: curve,
          actualCurve: supplied,
        });
      }
      signature = await signEC(data, key, { hashAlgorithm, curve });
    } else {
      // RSA signature — RS* (PKCS#1 v1.5) or PS* (PSS)
      signature = await signRSA(data, key, {
        hashAlgorithm,
        scheme: rsaScheme(algo),
      });
    }

    // RFC 7515: the signature segment is base64url. The sign functions return
    // hex/base64, so re-encode for an interoperable token. The bytes are
    // untouched — an ECDSA signature stays the raw R‖S RFC 7515 §3.4 requires.
    return `${data}.${toJwtSignature(signature, family)}`;
  } catch (error) {
    if (error instanceof JWTError) {
      throw error;
    }
    throw new JWTError('UNKNOWN_ERROR', {
      causeMessage: `Failed to create JWT: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    }, error instanceof Error ? error : undefined);
  }
};
