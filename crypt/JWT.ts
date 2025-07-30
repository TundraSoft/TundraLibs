/**
 * @fileoverview JWT (JSON Web Token) Implementation
 *
 * This module provides a complete implementation of JSON Web Tokens (JWTs) according to RFC 7519.
 * It supports HMAC-based signing algorithms (HS256, HS384, HS512) with comprehensive claim validation,
 * error handling, and security features.
 *
 * @module JWT
 * @version 1.0.0
 * @author TundraSoft
 * @see {@link https://tools.ietf.org/html/rfc7519} RFC 7519 - JSON Web Token (JWT)
 * @see {@link https://auth0.com/docs/secure/tokens/json-web-tokens} JWT Documentation
 */

import { decodeBase64Url, encodeBase64Url } from '$encoding';
import { signHMAC, verifyHMAC } from './sign.ts';
import { BaseError } from '@tundralibs/utils';

/**
 * Supported JWT signing algorithms.
 *
 * All algorithms use HMAC (Hash-based Message Authentication Code) with different hash functions:
 * - HS256: HMAC using SHA-256 (recommended for most use cases)
 * - HS384: HMAC using SHA-384 (stronger security, larger signatures)
 * - HS512: HMAC using SHA-512 (strongest security, largest signatures)
 *
 * @example
 * ```typescript
 * const algorithm: JWTAlgorithm = 'HS256';
 * const token = await issueJWT(algorithm, payload, secret);
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7518#section-3.2} RFC 7518 - HMAC with SHA-2 Functions
 */
export type JWTAlgorithm = 'HS256' | 'HS384' | 'HS512';

/**
 * JWT payload structure containing standard and custom claims.
 *
 * Standard claims (optional):
 * - `iat` (Issued At): Timestamp when the token was issued
 * - `exp` (Expiration Time): Timestamp when the token expires
 * - `nbf` (Not Before): Timestamp before which the token is invalid
 * - `jti` (JWT ID): Unique identifier for the token
 * - `sub` (Subject): Principal that is the subject of the JWT (typically user ID)
 * - `iss` (Issuer): Principal that issued the JWT
 * - `aud` (Audience): Recipients that the JWT is intended for
 *
 * Custom claims can be added using any key-value pairs.
 *
 * @example
 * ```typescript
 * const payload: JWTPayload = {
 *   sub: 'user123',
 *   iss: 'auth.example.com',
 *   aud: ['api.example.com', 'web.example.com'],
 *   exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
 *   role: 'admin',
 *   permissions: ['read', 'write']
 * };
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7519#section-4} RFC 7519 - JWT Claims
 */
export type JWTPayload = {
  /** Issued at timestamp (seconds since epoch) */
  iat?: number;
  /** Expiration timestamp (seconds since epoch) */
  exp?: number;
  /** Not before timestamp (seconds since epoch) */
  nbf?: number;
  /** JWT unique identifier */
  jti?: string;
  /** Subject (typically user ID) */
  sub?: string;
  /** Issuer of the token */
  iss?: string;
  /** Audience(s) that the token is intended for */
  aud?: string | string[];
  /** Custom claims - any additional key-value pairs */
  [key: string]: unknown;
};

/**
 * JWT header structure.
 *
 * Contains metadata about the token including the signing algorithm and token type.
 *
 * @example
 * ```typescript
 * const header: JWTHeader = {
 *   alg: 'HS256',
 *   typ: 'JWT'
 * };
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7519#section-5} RFC 7519 - JWT Header
 */
export type JWTHeader = {
  /** Signing algorithm used */
  alg: JWTAlgorithm;
  /** Token type (always 'JWT') */
  typ: 'JWT';
};

/**
 * Options for JWT verification and claim validation.
 *
 * Provides fine-grained control over how JWTs are validated, including
 * time-based checks, claim validation, and security options.
 *
 * @example
 * ```typescript
 * const options: JWTVerifyOptions = {
 *   audience: 'api.example.com',
 *   issuer: 'auth.example.com',
 *   maxAge: 3600, // 1 hour
 *   clockTolerance: 30, // 30 seconds tolerance for clock skew
 *   ignoreExpiration: false
 * };
 *
 * const payload = await verifyJWT(token, secret, options);
 * ```
 */
export type JWTVerifyOptions = {
  /** Expected audience(s) - token must match at least one */
  audience?: string | string[];
  /** Expected issuer(s) - token must match at least one */
  issuer?: string | string[];
  /** Expected subject - token must match exactly */
  subject?: string;
  /** Maximum age in seconds - token must not be older than this */
  maxAge?: number;
  /** Clock skew tolerance in seconds (default: 0) */
  clockTolerance?: number;
  /** Skip expiration time validation */
  ignoreExpiration?: boolean;
  /** Skip not-before time validation */
  ignoreNotBefore?: boolean;
};

/**
 * Standard JWT error codes and their corresponding messages.
 *
 * Each error code maps to a descriptive message that may contain template variables
 * for dynamic content. The ${causeMessage} template variable is commonly used to
 * include underlying error details or specific context.
 *
 * @example
 * ```typescript
 * // Using error codes directly
 * if (error instanceof JWTError && error.context.code === 'EXPIRED_TOKEN') {
 *   console.log('Token has expired, please refresh');
 * }
 *
 * // Custom error with interpolation
 * throw new JWTError('INVALID_JWT', { causeMessage: 'Malformed header' });
 * ```
 *
 * @see {@link JWTError} JWT error class implementation
 */
export const JWTErrorCodes = {
  /** JWT token has passed its expiration time */
  EXPIRED_TOKEN: 'JWT token is expired',
  /** JWT token is not yet valid (nbf claim) */
  NOT_ACTIVE: 'JWT token is not yet active',
  /** General JWT validation failure with specific cause */
  INVALID_JWT: 'JWT token is invalid - ${causeMessage}',
  /** Secret key is invalid, empty, or malformed */
  INVALID_SECRET: 'Invalid or empty secret provided - ${causeMessage}',
  /** Payload contains invalid data or structure */
  INVALID_PAYLOAD: 'Invalid payload format or content - ${causeMessage}',
  /** JWT header is malformed or contains invalid data */
  INVALID_HEADER: 'Invalid JWT header format - ${causeMessage}',
  /** Signature verification failed */
  INVALID_SIGNATURE: 'JWT signature verification failed - ${causeMessage}',
  /** Token format doesn't match JWT structure (header.payload.signature) */
  INVALID_FORMAT: 'Invalid JWT token format - ${causeMessage}',
  /** Algorithm specified in header is not supported */
  UNSUPPORTED_ALGORITHM: 'Unsupported JWT algorithm - ${causeMessage}',
  /** Standard or custom claims validation failed */
  INVALID_CLAIMS: 'Invalid JWT claims - ${causeMessage}',
  /** Token exceeds the maximum allowed age */
  MAX_AGE_EXCEEDED: 'JWT exceeds maximum age',
  /** Unexpected error during JWT processing */
  UNKNOWN_ERROR: 'Unknown JWT error - ${causeMessage}',
};

/**
 * Union type of all valid JWT error codes.
 *
 * @example
 * ```typescript
 * function handleJWTError(code: JWTErrorCode) {
 *   switch (code) {
 *     case 'EXPIRED_TOKEN':
 *       return 'Please log in again';
 *     case 'INVALID_SIGNATURE':
 *       return 'Token has been tampered with';
 *     default:
 *       return 'Authentication error';
 *   }
 * }
 * ```
 */
export type JWTErrorCode = keyof typeof JWTErrorCodes;

/**
 * Metadata structure for JWT errors.
 *
 * Provides additional context for JWT errors including the specific error code,
 * original code if mapping was applied, and optional JWT components for debugging.
 *
 * @example
 * ```typescript
 * const errorMeta: JWTErrorMeta = {
 *   code: 'INVALID_HEADER',
 *   causeMessage: 'Missing algorithm field',
 *   header: { alg: 'HS256', typ: 'JWT' }
 * };
 * ```
 */
export type JWTErrorMeta = {
  /** Standardized JWT error code */
  code: JWTErrorCode;
  /** Original error code if not in JWTErrorCodes (for error mapping) */
  originalCode?: string;
  /** JWT header if available for context */
  header?: JWTHeader;
  /** JWT payload if available for context */
  payload?: JWTPayload;
  /** Dynamic content for template interpolation */
  causeMessage?: string;
} & Record<string, unknown>;

/**
 * JWT-specific error class for all JWT-related errors.
 *
 * Extends BaseError to provide structured error handling with template interpolation
 * support for dynamic error messages. Automatically maps unknown error codes to
 * 'INVALID_JWT' while preserving the original code for debugging.
 *
 * Features:
 * - Template interpolation with ${causeMessage} variable
 * - Automatic error code mapping for unknown codes
 * - Contextual information including JWT components
 * - Proper error chaining with cause support
 *
 * @template M - Error metadata type extending JWTErrorMeta
 *
 * @example
 * ```typescript
 * // Simple error
 * throw new JWTError('EXPIRED_TOKEN');
 *
 * // Error with cause message
 * throw new JWTError('INVALID_JWT', { causeMessage: 'Malformed signature' });
 *
 * // Error with full context
 * throw new JWTError('INVALID_HEADER', {
 *   causeMessage: 'Missing required field',
 *   header: invalidHeader
 * });
 *
 * // Error with cause chain
 * try {
 *   // some operation
 * } catch (originalError) {
 *   throw new JWTError('UNKNOWN_ERROR', {
 *     causeMessage: originalError.message
 *   }, originalError);
 * }
 * ```
 *
 * @see {@link BaseError} Base error class for template interpolation details
 * @see {@link JWTErrorCodes} Available error codes and messages
 */

export class JWTError<
  M extends JWTErrorMeta = JWTErrorMeta,
> extends BaseError<M> {
  /**
   * Creates a new JWT error instance.
   *
   * Automatically handles error code mapping, template interpolation, and context
   * management. Unknown error codes are mapped to 'INVALID_JWT' while preserving
   * the original code for debugging purposes.
   *
   * @param code - JWT error code (must be a key from JWTErrorCodes)
   * @param meta - Error metadata including context and template variables
   * @param cause - Optional underlying error that caused this JWT error
   *
   * @throws {JWTError} Always throws - this is the constructor for the error class
   *
   * @example
   * ```typescript
   * // Basic error
   * throw new JWTError('EXPIRED_TOKEN');
   *
   * // Error with interpolation
   * throw new JWTError('INVALID_SIGNATURE', {
   *   causeMessage: 'HMAC verification failed'
   * });
   *
   * // Error with full context
   * throw new JWTError('INVALID_HEADER', {
   *   causeMessage: 'Missing algorithm',
   *   header: malformedHeader
   * });
   * ```
   */
  constructor(code: JWTErrorCode, meta?: Omit<M, 'code'>, cause?: Error) {
    const context: M = { code, ...meta } as M;
    if (!JWTErrorCodes[code]) {
      context.originalCode = code;
      code = 'INVALID_JWT';
    }
    context.code = code;

    // Handle template interpolation for causeMessage
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

/**
 * Maps JWT algorithms to their corresponding hash algorithms for HMAC operations.
 *
 * This mapping ensures that the correct hash function is used for each JWT algorithm:
 * - HS256 → SHA-256 (256-bit hash, fastest, recommended for most use cases)
 * - HS384 → SHA-384 (384-bit hash, stronger security, moderate performance)
 * - HS512 → SHA-512 (512-bit hash, strongest security, larger signatures)
 *
 * @internal
 * @see {@link https://tools.ietf.org/html/rfc7518#section-3.2} RFC 7518 - HMAC with SHA-2 Functions
 */
const JWT_ALGORITHM_MAP: Record<
  JWTAlgorithm,
  'SHA-256' | 'SHA-384' | 'SHA-512'
> = {
  'HS256': 'SHA-256',
  'HS384': 'SHA-384',
  'HS512': 'SHA-512',
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
const validatePayload = (payload: JWTPayload): void => {
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
const validateNumericClaims = (payload: JWTPayload): void => {
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
const validateAudienceClaim = (payload: JWTPayload): void => {
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

/**
 * Validates JWT claims against the provided options
 */
const validateClaims = (
  payload: JWTPayload,
  options: JWTVerifyOptions = {},
): void => {
  validateTimeClaims(payload, options);
  validateIssuerClaim(payload, options);
  validateSubjectClaim(payload, options);
  validateAudienceClaimOptions(payload, options);
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
  if (options.issuer !== undefined) {
    const expectedIssuers = Array.isArray(options.issuer)
      ? options.issuer
      : [options.issuer];
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
  if (options.subject !== undefined && payload.sub !== options.subject) {
    throw new JWTError('INVALID_CLAIMS', {
      causeMessage: 'Invalid subject',
      expectedSubject: options.subject,
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
  if (options.audience !== undefined) {
    const expectedAudiences = Array.isArray(options.audience)
      ? options.audience
      : [options.audience];
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
 * Verifies a JWT token and returns its validated payload.
 *
 * Performs comprehensive JWT verification according to RFC 7519 including:
 * - Token format validation (header.payload.signature structure)
 * - Header validation (algorithm, type)
 * - Signature verification using HMAC
 * - Time-based claim validation (exp, nbf, iat)
 * - Custom claim validation based on options
 * - Clock skew tolerance for time comparisons
 *
 * The verification process ensures the token is authentic, hasn't been tampered with,
 * and meets all specified criteria before returning the payload.
 *
 * @param token - JWT token string to verify
 * @param secret - Secret key used for signature verification (must match issuing secret)
 * @param options - Verification options for additional claim validation
 *
 * @returns Promise resolving to the validated JWT payload
 *
 * @throws {JWTError} INVALID_FORMAT - When token format is invalid
 * @throws {JWTError} INVALID_SECRET - When secret is empty or not a string
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
 * // Basic verification
 * try {
 *   const payload = await verifyJWT(token, 'my-secret-key');
 *   console.log('User ID:', payload.sub);
 * } catch (error) {
 *   if (error instanceof JWTError) {
 *     console.log('JWT Error:', error.context.code);
 *   }
 * }
 *
 * // Verification with claim validation
 * const payload = await verifyJWT(token, 'my-secret-key', {
 *   audience: 'api.example.com',
 *   issuer: 'auth.example.com',
 *   maxAge: 3600, // 1 hour max age
 *   clockTolerance: 30 // 30 seconds tolerance
 * });
 *
 * // Verification with multiple expected audiences
 * const payload = await verifyJWT(token, 'my-secret-key', {
 *   audience: ['api.example.com', 'web.example.com'],
 *   ignoreExpiration: false // strict expiration checking
 * });
 *
 * // Service-to-service verification
 * const payload = await verifyJWT(serviceToken, 'service-secret', {
 *   subject: 'service-account',
 *   issuer: 'internal-auth',
 *   maxAge: 300 // 5 minutes for service tokens
 * });
 * ```
 *
 * @see {@link issueJWT} For JWT creation
 * @see {@link JWTVerifyOptions} For verification options details
 * @see {@link https://tools.ietf.org/html/rfc7519} RFC 7519 - JSON Web Token (JWT)
 */
export const verifyJWT = async (
  token: string,
  secret: string,
  options: JWTVerifyOptions = {},
): Promise<JWTPayload> => {
  if (!token || typeof token !== 'string') {
    throw new JWTError('INVALID_FORMAT', {
      causeMessage: 'Token must be a non-empty string',
    });
  }

  if (!secret || typeof secret !== 'string') {
    throw new JWTError('INVALID_SECRET', {
      causeMessage: 'Secret must be a non-empty string',
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

  if (!['HS256', 'HS384', 'HS512'].includes(header.alg)) {
    throw new JWTError('UNSUPPORTED_ALGORITHM', {
      causeMessage: `Unsupported algorithm: ${header.alg}`,
      algorithm: header.alg,
      supportedAlgorithms: ['HS256', 'HS384', 'HS512'],
    });
  }

  // Verify signature
  const data = `${headerBase64}.${payloadBase64}`;
  const hashAlgorithm = JWT_ALGORITHM_MAP[header.alg];

  try {
    const isValid = await verifyHMAC(hashAlgorithm, secret, data, signature);
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

  // Validate claims
  validateClaims(payload, options);

  return payload;
};
