import { JWTError } from "./Error.ts";
import type { JWTHeader, JWTPayload, JWTVerifyOptions } from "./types.ts";
import { decodeBase64Url } from "$encoding";
import { verifyHMAC } from "../sign/mod.ts";
import { JWT_ALGORITHM_MAP, validateClaims } from "./helpers.ts";

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
  if (!token || typeof token !== "string") {
    throw new JWTError("INVALID_FORMAT", {
      causeMessage: "Token must be a non-empty string",
    });
  }

  if (!secret || typeof secret !== "string") {
    throw new JWTError("INVALID_SECRET", {
      causeMessage: "Secret must be a non-empty string",
    });
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JWTError("INVALID_FORMAT", {
      causeMessage: "Invalid JWT format",
    });
  }

  const headerBase64 = parts[0];
  const payloadBase64 = parts[1];
  const signature = parts[2];

  if (!headerBase64 || !payloadBase64 || !signature) {
    throw new JWTError("INVALID_FORMAT", {
      causeMessage: "Invalid JWT format - missing parts",
    });
  }

  // Decode and validate header
  let header: JWTHeader;
  try {
    const headerJson = new TextDecoder().decode(decodeBase64Url(headerBase64));
    header = JSON.parse(headerJson);
  } catch (error) {
    throw new JWTError("INVALID_HEADER", {
      causeMessage: "Invalid JWT header",
    }, error instanceof Error ? error : undefined);
  }

  if (!header.alg || !header.typ || header.typ !== "JWT") {
    throw new JWTError("INVALID_HEADER", {
      causeMessage: "Invalid JWT header format",
      header,
    });
  }

  if (!["HS256", "HS384", "HS512"].includes(header.alg)) {
    throw new JWTError("UNSUPPORTED_ALGORITHM", {
      causeMessage: `Unsupported algorithm: ${header.alg}`,
      algorithm: header.alg,
      supportedAlgorithms: ["HS256", "HS384", "HS512"],
    });
  }

  // Verify signature
  const data = `${headerBase64}.${payloadBase64}`;
  const hashAlgorithm = JWT_ALGORITHM_MAP[header.alg];

  try {
    const isValid = await verifyHMAC(hashAlgorithm, secret, data, signature);
    if (!isValid) {
      throw new JWTError("INVALID_SIGNATURE", {
        causeMessage: "Invalid signature",
      });
    }
  } catch (error) {
    if (error instanceof JWTError) {
      throw error;
    }
    throw new JWTError("INVALID_SIGNATURE", {
      causeMessage: "Signature verification failed",
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
    throw new JWTError("INVALID_PAYLOAD", {
      causeMessage: "Invalid JWT payload",
    }, error instanceof Error ? error : undefined);
  }

  // Validate claims
  validateClaims(payload, options);

  return payload;
};
