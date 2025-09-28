import { encodeBase64Url } from '$encoding';
import { JWTError } from './Error.ts';
import { type JWTAlgorithm, type JWTHeader, type JWTPayload } from './types.ts';
import { signHMAC } from '../sign/mod.ts';
import { JWT_ALGORITHM_MAP, validatePayload } from './helpers.ts';

/**
 * Issues (creates) a JWT token with the specified algorithm, payload, and secret.
 *
 * Creates a complete JWT following RFC 7519 standards with:
 * - Proper header with algorithm and type
 * - Validated and normalized payload with automatic `iat` setting
 * - HMAC signature using the specified algorithm and secret
 * - Base64URL encoding for all components
 *
 * The function automatically sets the `iat` (issued at) claim if not provided
 * and validates all claims for proper format and types.
 *
 * @param algo - HMAC algorithm to use for signing (HS256, HS384, or HS512)
 * @param payload - JWT payload containing claims (will be validated and normalized)
 * @param secret - Secret key for HMAC signing (must be non-empty string)
 *
 * @returns Promise resolving to the complete JWT token as a string
 *
 * @throws {JWTError} INVALID_SECRET - When secret is empty or not a string
 * @throws {JWTError} INVALID_PAYLOAD - When payload is not an object
 * @throws {JWTError} INVALID_JWT - When payload contains invalid claim formats
 * @throws {JWTError} INVALID_CLAIMS - When audience claim format is invalid
 * @throws {JWTError} UNKNOWN_ERROR - When unexpected errors occur during signing
 *
 * @example
 * ```typescript
 * // Basic JWT with expiration
 * const token = await issueJWT('HS256', {
 *   sub: 'user123',
 *   exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
 * }, 'my-secret-key');
 *
 * // JWT with multiple claims
 * const token = await issueJWT('HS384', {
 *   sub: 'user456',
 *   iss: 'auth.example.com',
 *   aud: ['api.example.com', 'web.example.com'],
 *   exp: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
 *   role: 'admin',
 *   permissions: ['read', 'write', 'delete']
 * }, 'stronger-secret');
 *
 * // JWT with automatic iat setting
 * const token = await issueJWT('HS512', {
 *   sub: 'service-account',
 *   // iat will be set automatically to current timestamp
 * }, 'service-secret');
 * ```
 *
 * @see {@link verifyJWT} For JWT verification
 * @see {@link JWTPayload} For payload structure details
 * @see {@link https://tools.ietf.org/html/rfc7519} RFC 7519 - JSON Web Token (JWT)
 */
export const issueJWT = async (
  algo: JWTAlgorithm,
  payload: JWTPayload,
  secret: string,
): Promise<string> => {
  if (!secret || typeof secret !== 'string') {
    throw new JWTError('INVALID_SECRET', {
      causeMessage: 'Secret must be a non-empty string',
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

  const header: JWTHeader = {
    alg: algo,
    typ: 'JWT',
  };

  try {
    const headerBase64 = encodeBase64Url(JSON.stringify(header));
    const payloadBase64 = encodeBase64Url(JSON.stringify(normalizedPayload));
    const data = `${headerBase64}.${payloadBase64}`;

    const hashAlgorithm = JWT_ALGORITHM_MAP[algo];
    const signature = await signHMAC(hashAlgorithm, secret, data);

    return `${data}.${signature}`;
  } catch (error) {
    throw new JWTError('UNKNOWN_ERROR', {
      causeMessage: `Failed to create JWT: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    }, error instanceof Error ? error : undefined);
  }
};
