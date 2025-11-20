import type { JWTAlgorithm, JWTPayload, JWTVerifyOptions } from "./types.ts";
import { JWTError } from "./Error.ts";

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
export const JWT_ALGORITHM_MAP: Record<
  JWTAlgorithm,
  "SHA-256" | "SHA-384" | "SHA-512"
> = {
  "HS256": "SHA-256",
  "HS384": "SHA-384",
  "HS512": "SHA-512",
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
  if (payload.exp !== undefined && typeof payload.exp !== "number") {
    throw new JWTError("INVALID_JWT", {
      causeMessage: "Expiration time (exp) must be a number",
    });
  }

  if (payload.nbf !== undefined && typeof payload.nbf !== "number") {
    throw new JWTError("INVALID_JWT", {
      causeMessage: "Not before time (nbf) must be a number",
    });
  }

  if (typeof payload.iat !== "number") {
    throw new JWTError("INVALID_JWT", {
      causeMessage: "Issued at (iat) must be a number",
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

  if (typeof payload.aud !== "string" && !Array.isArray(payload.aud)) {
    throw new JWTError("INVALID_CLAIMS", {
      causeMessage: "Audience (aud) must be a string or array of strings",
    });
  }

  if (Array.isArray(payload.aud)) {
    for (const aud of payload.aud) {
      if (typeof aud !== "string") {
        throw new JWTError("INVALID_CLAIMS", {
          causeMessage: "All audience values must be strings",
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
      throw new JWTError("EXPIRED_TOKEN", {
        exp: payload.exp,
        now,
        tolerance,
      });
    }
  }

  // Check not before
  if (!options.ignoreNotBefore && payload.nbf !== undefined) {
    if (now < payload.nbf - tolerance) {
      throw new JWTError("NOT_ACTIVE", {
        nbf: payload.nbf,
        now,
        tolerance,
      });
    }
  }

  // Check maximum age
  if (options.maxAge !== undefined && payload.iat !== undefined) {
    if (now - payload.iat > options.maxAge) {
      throw new JWTError("MAX_AGE_EXCEEDED", {
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
      throw new JWTError("INVALID_CLAIMS", {
        causeMessage: "Invalid issuer",
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
    throw new JWTError("INVALID_CLAIMS", {
      causeMessage: "Invalid subject",
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
      throw new JWTError("INVALID_CLAIMS", {
        causeMessage: "Invalid audience",
        expectedAudiences,
        actualAudience: payload.aud,
      });
    }
  }
};
