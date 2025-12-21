import { encodeBase64Url } from '$encoding';
import { JWTError } from './Error.ts';
import { type JWTAlgorithm, type JWTHeader, type JWTPayload } from './types.ts';
import { signHMAC, signRSA } from '../sign/mod.ts';
import { JWT_ALGORITHM_MAP, validatePayload } from './helpers.ts';

/**
 * Issues (creates) a JWT token with the specified algorithm, payload, and key/secret.
 *
 * Creates a complete JWT following RFC 7519 standards with:
 * - Proper header with algorithm and type
 * - Validated and normalized payload with automatic `iat` setting
 * - Signature using HMAC (HS*) or RSA-PSS (RS*) algorithms
 * - Base64URL encoding for all components
 *
 * The function automatically sets the `iat` (issued at) claim if not provided
 * and validates all claims for proper format and types.
 *
 * @param algo - Algorithm to use for signing (HS256/384/512 for HMAC, RS256/384/512 for RSA)
 * @param payload - JWT payload containing claims (will be validated and normalized)
 * @param key - Secret key for HMAC or PEM-encoded private key for RSA (must be non-empty string)
 * @param kid - Optional Key ID for key rotation scenarios
 *
 * @returns Promise resolving to the complete JWT token as a string
 *
 * @throws {JWTError} INVALID_SECRET - When key is empty or not a string
 * @throws {JWTError} INVALID_PAYLOAD - When payload is not an object
 * @throws {JWTError} INVALID_JWT - When payload contains invalid claim formats
 * @throws {JWTError} INVALID_CLAIMS - When audience claim format is invalid
 * @throws {JWTError} UNKNOWN_ERROR - When unexpected errors occur during signing
 *
 * @example
 * ```typescript
 * // HMAC JWT with expiration
 * const token = await issueJWT('HS256', {
 *   sub: 'user123',
 *   exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
 * }, 'my-secret-key');
 *
 * // RSA JWT with private key
 * const token = await issueJWT('RS256', {
 *   sub: 'user456',
 *   iss: 'auth.example.com',
 *   aud: ['api.example.com', 'web.example.com'],
 *   exp: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
 * }, privateKeyPEM);
 *
 * // JWT with key ID for rotation
 * const token = await issueJWT('HS512', {
 *   sub: 'service-account',
 * }, 'service-secret', 'key-2024-01');
 * ```
 *
 * @see {@link verifyJWT} For JWT verification
 * @see {@link JWTPayload} For payload structure details
 * @see {@link https://tools.ietf.org/html/rfc7519} RFC 7519 - JSON Web Token (JWT)
 */
export const issueJWT = async <T extends JWTPayload = JWTPayload>(
  algo: JWTAlgorithm,
  payload: T,
  key: string,
  kid?: string,
): Promise<string> => {
  if (!key || typeof key !== 'string') {
    throw new JWTError('INVALID_SECRET', {
      causeMessage: 'Key must be a non-empty string',
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

  if (kid) {
    header.kid = kid;
  }

  try {
    const headerBase64 = encodeBase64Url(JSON.stringify(header));
    const payloadBase64 = encodeBase64Url(JSON.stringify(normalizedPayload));
    const data = `${headerBase64}.${payloadBase64}`;

    const hashAlgorithm = JWT_ALGORITHM_MAP[algo];

    let signature: string;
    if (algo.startsWith('HS')) {
      // HMAC signature
      signature = await signHMAC(data, key, { hashAlgorithm });
    } else if (algo.startsWith('RS')) {
      // RSA signature
      signature = await signRSA(data, key, { hashAlgorithm });
    } else {
      throw new JWTError('UNSUPPORTED_ALGORITHM', {
        causeMessage: `Unsupported algorithm: ${algo}`,
        algorithm: algo,
      });
    }

    return `${data}.${signature}`;
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
