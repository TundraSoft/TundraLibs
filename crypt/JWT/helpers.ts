import type {
  JWTAlgorithm,
  JWTHeader,
  JWTPayload,
  JWTVerifyOptions,
} from './types.ts';
import { JWTError } from './Error.ts';
import { decodeBase64Url } from 'jsr:@std/encoding@1.0.8';

/**
 * Maps JWT algorithms to their corresponding hash algorithms.
 *
 * This mapping ensures that the correct hash function is used for each JWT algorithm:
 * - HS256/RS256 → SHA-256 (256-bit hash, fastest, recommended for most use cases)
 * - HS384/RS384 → SHA-384 (384-bit hash, stronger security, moderate performance)
 * - HS512/RS512 → SHA-512 (512-bit hash, strongest security, larger signatures)
 *
 * @internal
 * @see {@link https://tools.ietf.org/html/rfc7518#section-3} RFC 7518 - JWT Algorithms
 */
export const JWT_ALGORITHM_MAP: Record<
  JWTAlgorithm,
  'SHA-256' | 'SHA-384' | 'SHA-512'
> = {
  'HS256': 'SHA-256',
  'HS384': 'SHA-384',
  'HS512': 'SHA-512',
  'RS256': 'SHA-256',
  'RS384': 'SHA-384',
  'RS512': 'SHA-512',
};

/**
 * Validates JWT payload for required fields and proper formats.
 *
 * Performs comprehensive validation of JWT payload including:
 * - Automatic `iat` (issued at) timestamp setting if not provided
 * - Numeric claims validation (exp, nbf, iat)
 * - Audience claim format validation
 *
 * @param payload - JWT payload to validate and potentially modify
 *
 * @throws {JWTError} INVALID_JWT - When payload contains invalid data types or formats
 *
 * @internal
 * @see {@link validateNumericClaims} Numeric claims validation
 * @see {@link validateAudienceClaim} Audience claim validation
 */
export const validatePayload = (payload: JWTPayload): void => {
  const now = Math.floor(Date.now() / 1000);

  // Set iat if not provided
  if (!payload.iat) {
    payload.iat = now;
  }

  validateNumericClaims(payload);
  validateAudienceClaim(payload);
};

/**
 * Validates numeric claims (exp, nbf, iat) in JWT payload.
 *
 * Ensures that time-based claims are properly formatted as Unix timestamps
 * (seconds since epoch). These claims are critical for JWT security and
 * must be numeric to enable proper time comparisons.
 *
 * @param payload - JWT payload containing claims to validate
 *
 * @throws {JWTError} INVALID_JWT - When numeric claims are not numbers
 *
 * @internal
 * @see {@link https://tools.ietf.org/html/rfc7519#section-4.1} RFC 7519 - Numeric Date Claims
 */
export const validateNumericClaims = (payload: JWTPayload): void => {
  if (payload.exp !== undefined && typeof payload.exp !== 'number') {
    throw new JWTError('INVALID_JWT', {
      causeMessage: 'Expiration time (exp) must be a number',
    });
  }

  if (payload.nbf !== undefined && typeof payload.nbf !== 'number') {
    throw new JWTError('INVALID_JWT', {
      causeMessage: 'Not before time (nbf) must be a number',
    });
  }

  if (typeof payload.iat !== 'number') {
    throw new JWTError('INVALID_JWT', {
      causeMessage: 'Issued at (iat) must be a number',
    });
  }
};

/**
 * Validates audience claim format according to JWT standards.
 *
 * The audience claim (aud) can be either:
 * - A single string representing one intended recipient
 * - An array of strings representing multiple intended recipients
 *
 * This validation ensures the claim format is correct for proper JWT processing
 * and interoperability with other JWT implementations.
 *
 * @param payload - JWT payload containing the audience claim to validate
 *
 * @throws {JWTError} INVALID_CLAIMS - When audience format is invalid
 *
 * @internal
 * @see {@link https://tools.ietf.org/html/rfc7519#section-4.1.3} RFC 7519 - Audience Claim
 */
export const validateAudienceClaim = (payload: JWTPayload): void => {
  if (payload.aud === undefined) {
    return;
  }

  if (typeof payload.aud !== 'string' && !Array.isArray(payload.aud)) {
    throw new JWTError('INVALID_CLAIMS', {
      causeMessage: 'Audience (aud) must be a string or array of strings',
    });
  }

  if (Array.isArray(payload.aud)) {
    for (const aud of payload.aud) {
      if (typeof aud !== 'string') {
        throw new JWTError('INVALID_CLAIMS', {
          causeMessage: 'All audience values must be strings',
        });
      }
    }
  }
};

/**
 * Validates JWT claims against the provided options
 */
export const validateClaims = (
  payload: JWTPayload,
  options: JWTVerifyOptions = {},
): void => {
  validateTimeClaims(payload, options);
  validateIssuerClaim(payload, options);
  validateSubjectClaim(payload, options);
  validateAudienceClaimOptions(payload, options);
  validateJwtIdClaim(payload, options);
  validateRequiredClaims(payload, options);
};

/**
 * Validates time-based claims (exp, nbf, maxAge)
 */
const validateTimeClaims = (
  payload: JWTPayload,
  options: JWTVerifyOptions,
): void => {
  const now = Math.floor(Date.now() / 1000);
  const tolerance = options.clockTolerance ?? 0;

  // Check expiration
  if (!options.ignoreExpiration && payload.exp !== undefined) {
    if (now > payload.exp + tolerance) {
      throw new JWTError('EXPIRED_TOKEN', {
        exp: payload.exp,
        now,
        tolerance,
      });
    }
  }

  // Check not before
  if (!options.ignoreNotBefore && payload.nbf !== undefined) {
    if (now < payload.nbf - tolerance) {
      throw new JWTError('NOT_ACTIVE', {
        nbf: payload.nbf,
        now,
        tolerance,
      });
    }
  }

  // Check maximum age
  if (options.maxAge !== undefined && payload.iat !== undefined) {
    if (now - payload.iat > options.maxAge) {
      throw new JWTError('MAX_AGE_EXCEEDED', {
        iat: payload.iat,
        maxAge: options.maxAge,
        actualAge: now - payload.iat,
      });
    }
  }
};

/**
 * Validates issuer claim
 */
const validateIssuerClaim = (
  payload: JWTPayload,
  options: JWTVerifyOptions,
): void => {
  if (options.iss !== undefined) {
    const expectedIssuers = Array.isArray(options.iss)
      ? options.iss
      : [options.iss];
    if (!payload.iss || !expectedIssuers.includes(payload.iss)) {
      throw new JWTError('INVALID_CLAIMS', {
        causeMessage: 'Invalid issuer',
        expectedIssuers,
        actualIssuer: payload.iss,
      });
    }
  }
};

/**
 * Validates subject claim
 */
const validateSubjectClaim = (
  payload: JWTPayload,
  options: JWTVerifyOptions,
): void => {
  if (options.sub !== undefined && payload.sub !== options.sub) {
    throw new JWTError('INVALID_CLAIMS', {
      causeMessage: 'Invalid subject',
      expectedSubject: options.sub,
      actualSubject: payload.sub,
    });
  }
};

/**
 * Validates audience claim against options
 */
const validateAudienceClaimOptions = (
  payload: JWTPayload,
  options: JWTVerifyOptions,
): void => {
  if (options.aud !== undefined) {
    const expectedAudiences = Array.isArray(options.aud)
      ? options.aud
      : [options.aud];
    const tokenAudiences = Array.isArray(payload.aud)
      ? payload.aud
      : [payload.aud];

    if (
      !payload.aud ||
      !expectedAudiences.some((expected) => tokenAudiences.includes(expected))
    ) {
      throw new JWTError('INVALID_CLAIMS', {
        causeMessage: 'Invalid audience',
        expectedAudiences,
        actualAudience: payload.aud,
      });
    }
  }
};

/**
 * Validates JWT ID claim
 */
const validateJwtIdClaim = (
  payload: JWTPayload,
  options: JWTVerifyOptions,
): void => {
  if (options.jti !== undefined && payload.jti !== options.jti) {
    throw new JWTError('INVALID_CLAIMS', {
      causeMessage: 'Invalid JWT ID',
      expectedJwtId: options.jti,
      actualJwtId: payload.jti,
    });
  }
};

/**
 * Validates that all required claims are present
 */
const validateRequiredClaims = (
  payload: JWTPayload,
  options: JWTVerifyOptions,
): void => {
  if (options.requiredClaims !== undefined) {
    const missingClaims = options.requiredClaims.filter(
      (claim) => !(claim in payload) || payload[claim] === undefined,
    );
    if (missingClaims.length > 0) {
      throw new JWTError('INVALID_CLAIMS', {
        causeMessage: 'Missing required claims',
        missingClaims,
        requiredClaims: options.requiredClaims,
      });
    }
  }
};

/**
 * Key configuration for JWT refresh operations.
 *
 * For HMAC algorithms (HS256/384/512), provide a single key string.
 * For RSA algorithms (RS256/384/512), provide separate verify and sign keys.
 */
export type RefreshKeyConfig = {
  /**
   * Public key for verifying the existing token (RSA only)
   */
  verifyKey: string;
  /**
   * Private key for signing the new token (RSA only)
   */
  signKey: string;
};

/**
 * Decodes a JWT token without verifying its signature.
 *
 * This function extracts and parses the header and payload from a JWT token
 * WITHOUT performing signature verification. Use this only for debugging or
 * when you need to inspect token contents without validating authenticity.
 *
 * ⚠️ **Security Warning**: This function does NOT verify the token's signature.
 * Never trust the decoded data for security-critical operations without
 * first verifying the token using `verifyJWT()`.
 *
 * @param token - JWT token string to decode
 *
 * @returns Object containing decoded header and payload
 *
 * @throws {JWTError} INVALID_FORMAT - When token format is invalid
 * @throws {JWTError} INVALID_HEADER - When header cannot be decoded
 * @throws {JWTError} INVALID_PAYLOAD - When payload cannot be decoded
 *
 * @example
 * ```typescript
 * // Decode token for debugging
 * const { header, payload } = decodeJWT(token);
 * console.log('Algorithm:', header.alg);
 * console.log('Expires:', new Date(payload.exp! * 1000));
 *
 * // Check token contents before verification
 * const { payload } = decodeJWT(token);
 * if (payload.iss !== 'expected-issuer') {
 *   console.log('Wrong issuer, skipping verification');
 *   return;
 * }
 * // Now verify with appropriate key
 * await verifyJWT(token, appropriateKey);
 * ```
 *
 * @see {@link verifyJWT} For secure token verification
 */
export const decodeJWT = (
  token: string,
): { header: JWTHeader; payload: JWTPayload } => {
  if (!token || typeof token !== 'string') {
    throw new JWTError('INVALID_FORMAT', {
      causeMessage: 'Token must be a non-empty string',
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

  if (!headerBase64 || !payloadBase64) {
    throw new JWTError('INVALID_FORMAT', {
      causeMessage: 'Invalid JWT format - missing parts',
    });
  }

  // Decode header
  let header: JWTHeader;
  try {
    const headerJson = new TextDecoder().decode(decodeBase64Url(headerBase64));
    header = JSON.parse(headerJson);
  } catch (error) {
    throw new JWTError('INVALID_HEADER', {
      causeMessage: 'Invalid JWT header',
    }, error instanceof Error ? error : undefined);
  }

  // Decode payload
  let payload: JWTPayload;
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

  return { header, payload };
};

/**
 * Refreshes a JWT token by extending its expiration time.
 *
 * This function verifies the provided token, extracts its payload,
 * updates the expiration time, and issues a new token with the same
 * algorithm. Supports both HMAC and RSA algorithms with appropriate
 * key handling for each.
 *
 * **For HMAC (HS256/384/512):** Use a single secret key for both operations
 * **For RSA (RS256/384/512):** Provide separate keys using RefreshKeyConfig
 *
 * @param token - JWT token to refresh
 * @param keyOrKeys - For HMAC: secret key string. For RSA: object with verifyKey (public) and signKey (private)
 * @param extendBy - Number of seconds to extend expiration (default: 3600 = 1 hour)
 * @param kid - Optional Key ID for the new token
 *
 * @returns Promise resolving to the new JWT token with extended expiration
 *
 * @throws {JWTError} All errors from `verifyJWT` if token is invalid
 * @throws {JWTError} All errors from `issueJWT` if new token creation fails
 * @throws {JWTError} INVALID_SECRET - When RSA token provided but keys are not in correct format
 *
 * @example
 * ```typescript
 * // HMAC token refresh (same secret for verify and sign)
 * const newToken = await refreshJWT(oldToken, 'secret-key');
 *
 * // HMAC with custom extension
 * const newToken = await refreshJWT(oldToken, 'secret-key', 7200); // 2 hours
 *
 * // RSA token refresh (separate public/private keys)
 * const newToken = await refreshJWT(
 *   oldToken,
 *   {
 *     verifyKey: publicKeyPEM,  // Verify old token with public key
 *     signKey: privateKeyPEM     // Sign new token with private key
 *   },
 *   3600
 * );
 *
 * // RSA with key ID
 * const newToken = await refreshJWT(
 *   oldToken,
 *   { verifyKey: publicKey, signKey: privateKey },
 *   3600,
 *   'key-2024-02'
 * );
 *
 * // Automatic key detection based on algorithm
 * const { header } = decodeJWT(token);
 * const newToken = header.alg.startsWith('RS')
 *   ? await refreshJWT(token, { verifyKey: publicKey, signKey: privateKey })
 *   : await refreshJWT(token, hmacSecret);
 * ```
 *
 * @see {@link verifyJWT} For token verification
 * @see {@link issueJWT} For token creation
 */
export const refreshJWT = async <T extends JWTPayload = JWTPayload>(
  token: string,
  keyOrKeys: string | RefreshKeyConfig,
  extendBy: number = 3600,
  kid?: string,
): Promise<string> => {
  // Lazy import to avoid circular dependency
  const { issueJWT } = await import('./issue.ts');
  const { verifyJWT } = await import('./verify.ts');

  // Decode to get algorithm
  const { header } = decodeJWT(token);

  const isRSA = header.alg.startsWith('RS');
  const isHMAC = header.alg.startsWith('HS');

  // Validate key configuration based on algorithm
  if (isRSA && typeof keyOrKeys === 'string') {
    throw new JWTError('INVALID_SECRET', {
      causeMessage:
        'RSA tokens require separate verifyKey and signKey. Provide { verifyKey: string, signKey: string }',
      algorithm: header.alg,
    });
  }

  if (isHMAC && typeof keyOrKeys !== 'string') {
    throw new JWTError('INVALID_SECRET', {
      causeMessage: 'HMAC tokens require a single secret key string',
      algorithm: header.alg,
    });
  }

  // Determine keys for verification and signing
  const verifyKey = typeof keyOrKeys === 'string'
    ? keyOrKeys
    : keyOrKeys.verifyKey;
  const signKey = typeof keyOrKeys === 'string' ? keyOrKeys : keyOrKeys.signKey;

  // Verify the current token
  const payload = await verifyJWT<T>(token, verifyKey);

  // Update expiration time
  const now = Math.floor(Date.now() / 1000);
  const newPayload = {
    ...payload,
    iat: now,
    exp: now + extendBy,
  };

  // Issue new token with same algorithm
  return await issueJWT(header.alg, newPayload, signKey, kid ?? header.kid);
};
