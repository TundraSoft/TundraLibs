import { JWTError } from './Error.ts';
import type { JWTHeader, JWTPayload, JWTVerifyOptions } from './types.ts';
import { decodeBase64Url } from 'jsr:@std/encoding@1.0.8';
import { verifyHMAC, verifyRSA } from '../sign/mod.ts';
import { JWT_ALGORITHM_MAP, validateClaims } from './helpers.ts';

/**
 * Verifies a JWT token and returns its validated payload.
 *
 * Performs comprehensive JWT verification according to RFC 7519 including:
 * - Token format validation (header.payload.signature structure)
 * - Header validation (algorithm, type)
 * - Signature verification using HMAC or RSA
 * - Time-based claim validation (exp, nbf, iat)
 * - Custom claim validation based on options
 * - Clock skew tolerance for time comparisons
 *
 * The verification process ensures the token is authentic, hasn't been tampered with,
 * and meets all specified criteria before returning the payload.
 *
 * @param token - JWT token string to verify
 * @param key - Secret key for HMAC or PEM-encoded public key for RSA
 * @param options - Verification options for additional claim validation
 *
 * @returns Promise resolving to the validated JWT payload
 *
 * @throws {JWTError} INVALID_FORMAT - When token format is invalid
 * @throws {JWTError} INVALID_SECRET - When key is empty or not a string
 * @throws {JWTError} INVALID_HEADER - When JWT header is malformed or invalid
 * @throws {JWTError} UNSUPPORTED_ALGORITHM - When algorithm is not supported
 * @throws {JWTError} INVALID_SIGNATURE - When signature verification fails
 * @throws {JWTError} INVALID_PAYLOAD - When payload is malformed
 * @throws {JWTError} EXPIRED_TOKEN - When token has expired
 * @throws {JWTError} NOT_ACTIVE - When token is not yet active (nbf)
 * @throws {JWTError} MAX_AGE_EXCEEDED - When token exceeds maximum age
 * @throws {JWTError} INVALID_CLAIMS - When claim validation fails
 * @throws {JWTError} UNKNOWN_ERROR - When unexpected errors occur
 *
 * @example
 * ```typescript
 * // Basic HMAC verification
 * try {
 *   const payload = await verifyJWT(token, 'my-secret-key');
 *   console.log('User ID:', payload.sub);
 * } catch (error) {
 *   if (error instanceof JWTError) {
 *     console.log('JWT Error:', error.context.code);
 *   }
 * }
 *
 * // RSA verification with claim validation
 * const payload = await verifyJWT(token, publicKeyPEM, {
 *   algorithm: 'RS256',
 *   audience: 'api.example.com',
 *   issuer: 'auth.example.com',
 *   maxAge: 3600, // 1 hour max age
 *   clockTolerance: 30 // 30 seconds tolerance
 * });
 *
 * // Verification with required claims
 * const payload = await verifyJWT(token, 'my-secret-key', {
 *   requiredClaims: ['sub', 'iat', 'role'],
 *   jwtId: 'unique-token-id-123'
 * });
 * ```
 *
 * @see {@link issueJWT} For JWT creation
 * @see {@link JWTVerifyOptions} For verification options details
 * @see {@link https://tools.ietf.org/html/rfc7519} RFC 7519 - JSON Web Token (JWT)
 */
export const verifyJWT = async <T extends JWTPayload = JWTPayload>(
  token: string,
  key: string,
  options: JWTVerifyOptions = {},
): Promise<T> => {
  if (!token || typeof token !== 'string') {
    throw new JWTError('INVALID_FORMAT', {
      causeMessage: 'Token must be a non-empty string',
    });
  }

  if (!key || typeof key !== 'string') {
    throw new JWTError('INVALID_SECRET', {
      causeMessage: 'Key must be a non-empty string',
    });
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JWTError('INVALID_FORMAT', {
      causeMessage: 'Invalid JWT format',
    });
  }

  const headerBase64 = parts[0];
  const payloadBase64 = parts[1];
  const signature = parts[2];

  if (!headerBase64 || !payloadBase64 || !signature) {
    throw new JWTError('INVALID_FORMAT', {
      causeMessage: 'Invalid JWT format - missing parts',
    });
  }

  // Decode and validate header
  let header: JWTHeader;
  try {
    const headerJson = new TextDecoder().decode(decodeBase64Url(headerBase64));
    header = JSON.parse(headerJson);
  } catch (error) {
    throw new JWTError('INVALID_HEADER', {
      causeMessage: 'Invalid JWT header',
    }, error instanceof Error ? error : undefined);
  }

  if (!header.alg || !header.typ || header.typ !== 'JWT') {
    throw new JWTError('INVALID_HEADER', {
      causeMessage: 'Invalid JWT header format',
      header,
    });
  }

  // Validate algorithm
  const supportedAlgorithms = [
    'HS256',
    'HS384',
    'HS512',
    'RS256',
    'RS384',
    'RS512',
  ];
  if (!supportedAlgorithms.includes(header.alg)) {
    throw new JWTError('UNSUPPORTED_ALGORITHM', {
      causeMessage: `Unsupported algorithm: ${header.alg}`,
      algorithm: header.alg,
      supportedAlgorithms,
    });
  }

  // Check if expected algorithm matches (if specified)
  if (options.algorithm && header.alg !== options.algorithm) {
    throw new JWTError('UNSUPPORTED_ALGORITHM', {
      causeMessage:
        `Algorithm mismatch: expected ${options.algorithm}, got ${header.alg}`,
      expectedAlgorithm: options.algorithm,
      actualAlgorithm: header.alg,
    });
  }

  // Verify signature
  const data = `${headerBase64}.${payloadBase64}`;
  const hashAlgorithm = JWT_ALGORITHM_MAP[header.alg];

  try {
    let isValid: boolean;
    if (header.alg.startsWith('HS')) {
      // HMAC verification
      isValid = await verifyHMAC(data, signature, key, { hashAlgorithm });
    } else if (header.alg.startsWith('RS')) {
      // RSA verification
      isValid = await verifyRSA(data, signature, key, { hashAlgorithm });
    } else {
      throw new JWTError('UNSUPPORTED_ALGORITHM', {
        causeMessage: `Unsupported algorithm: ${header.alg}`,
        algorithm: header.alg,
      });
    }

    if (!isValid) {
      throw new JWTError('INVALID_SIGNATURE', {
        causeMessage: 'Invalid signature',
      });
    }
  } catch (error) {
    if (error instanceof JWTError) {
      throw error;
    }
    throw new JWTError('INVALID_SIGNATURE', {
      causeMessage: 'Signature verification failed',
    }, error instanceof Error ? error : undefined);
  }

  // Decode payload
  let payload: T;
  try {
    const payloadJson = new TextDecoder().decode(
      decodeBase64Url(payloadBase64),
    );
    payload = JSON.parse(payloadJson);
  } catch (error) {
    throw new JWTError('INVALID_PAYLOAD', {
      causeMessage: 'Invalid JWT payload',
    }, error instanceof Error ? error : undefined);
  }

  // Validate claims
  validateClaims(payload, options);

  return payload;
};
