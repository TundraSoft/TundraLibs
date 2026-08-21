/**
 * @fileoverview JWT helper functions and utilities.
 *
 * Internal helper functions for JWT operations including algorithm mapping,
 * payload validation, claim normalization, token decoding, and token refresh.
 *
 * @module
 * @internal
 */

import type {
  JWTAlgorithm,
  JWTHeader,
  JWTPayload,
  JWTVerifyOptions,
} from './types/mod.ts';
import { JWTError } from './errors/mod.ts';
import { describeKey, type ECCurve, type SigningKey } from '../sign/mod.ts';
import {
  decodeBase64,
  decodeBase64Url,
  decodeHex,
  encodeBase64,
  encodeBase64Url,
  encodeHex,
} from '@std/encoding';

/**
 * Maps JWT algorithms to their corresponding hash algorithms.
 *
 * This mapping ensures that the correct hash function is used for each JWT algorithm:
 * - HS256/RS256/ES256 → SHA-256 (256-bit hash, fastest, recommended for most use cases)
 * - HS384/RS384/ES384 → SHA-384 (384-bit hash, stronger security, moderate performance)
 * - HS512/RS512/ES512 → SHA-512 (512-bit hash, strongest security, larger signatures)
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
  'PS256': 'SHA-256',
  'PS384': 'SHA-384',
  'PS512': 'SHA-512',
  'ES256': 'SHA-256',
  'ES384': 'SHA-384',
  'ES512': 'SHA-512',
};

/**
 * The curve each `ES*` algorithm is bound to by RFC 7518 §3.4.
 *
 * The pairing is fixed and one-to-one: an `ES256` signature is *only* ever made
 * on P-256. Note the last row — **`ES512` uses P-521**, whose 521-bit field is
 * not a typo for 512 and is why its signatures are 132 bytes rather than 128.
 *
 * @internal
 * @see {@link https://www.rfc-editor.org/rfc/rfc7518#section-3.4} RFC 7518 §3.4
 */
export const JWT_EC_CURVES: Record<string, ECCurve> = {
  'ES256': 'P-256',
  'ES384': 'P-384',
  'ES512': 'P-521',
};

/**
 * Algorithm family — the *kind* of cryptographic key an algorithm requires.
 *
 * - `'HMAC'` — symmetric algorithms (HS256/384/512) keyed with a raw secret.
 * - `'RSA'` — asymmetric algorithms (RS/PS256/384/512) keyed with an RSA key.
 * - `'EC'` — asymmetric algorithms (ES256/384/512) keyed with an EC key on the
 *   one curve the algorithm binds.
 *
 * @internal
 */
export type JWTAlgorithmFamily = 'HMAC' | 'RSA' | 'EC';

/**
 * Returns the {@link JWTAlgorithmFamily} an algorithm belongs to.
 *
 * @param alg - JWT algorithm identifier.
 * @returns `'EC'` for `ES*`, `'RSA'` for `RS*`/`PS*`, `'HMAC'` for `HS*`.
 * @internal
 */
export const algorithmFamily = (alg: JWTAlgorithm): JWTAlgorithmFamily => {
  if (alg.startsWith('ES')) {
    return 'EC';
  }
  return alg.startsWith('RS') || alg.startsWith('PS') ? 'RSA' : 'HMAC';
};

/**
 * Returns the curve an `ES*` algorithm requires.
 *
 * @param alg - JWT algorithm identifier.
 * @returns The bound {@link ECCurve}, or `undefined` for non-`ES*` algorithms.
 * @internal
 */
export const algorithmCurve = (alg: JWTAlgorithm): ECCurve | undefined =>
  JWT_EC_CURVES[alg];

/**
 * Maps an RSA-family JWT algorithm to its Web Crypto signature scheme:
 * `RS*` → RSASSA-PKCS1-v1_5 (RFC 7518), `PS*` → RSASSA-PSS.
 *
 * @param alg - JWT algorithm identifier (`RS*` or `PS*`).
 * @returns `'PKCS1'` for `RS*`, `'PSS'` for `PS*`.
 * @internal
 */
export const rsaScheme = (alg: JWTAlgorithm): 'PKCS1' | 'PSS' =>
  alg.startsWith('PS') ? 'PSS' : 'PKCS1';

/**
 * The two conventional JWT `typ` values, offered as a convenient starting set
 * for callers that pin {@link verifyJWT}'s `typ` option.
 *
 * - `'JWT'` — the conventional value for a plain JWT (RFC 7519 §5.1).
 * - `'at+jwt'` — an OAuth 2.0 access token (RFC 9068 §2.1).
 *
 * NOTE: this is **not** applied by default. RFC 7519 §5.1 makes `typ` optional
 * and leaves its interpretation to the application, so {@link verifyJWT}
 * ignores the header unless a caller opts in by passing `typ` — see that
 * option's docs. This constant only exists so opting in doesn't mean
 * hand-typing the common values.
 *
 * Matching is case-insensitive and treats an omitted `application/` prefix as
 * implied (see {@link normalizeTyp}), so no case or prefix variants need to be
 * listed here.
 *
 * Spread it to widen the set without losing these two:
 *
 * ```ts
 * import { verifyJWT } from '@tundralibs/crypt/JWT';
 *
 * declare const token: string;
 * declare const key: string;
 *
 * await verifyJWT(token, key, { typ: [...JWT_DEFAULT_TYPES, 'my+jwt'] });
 * ```
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9068#section-2.1} RFC 9068 — JWT Access Tokens
 */
export const JWT_DEFAULT_TYPES: readonly string[] = ['JWT', 'at+jwt'];

/**
 * Normalises a JOSE `typ` header value to its canonical media type so two
 * spellings of the same type compare equal.
 *
 * `typ` carries a media type, and RFC 7515 §4.1.9 (which RFC 7519 §5.1 adopts
 * for JWTs) defines exactly two liberties a producer may take:
 *
 * 1. **Case is insignificant.** Media types are case-insensitive (RFC 2045
 *    §5.1), so `at+jwt` and `AT+JWT` are the same type.
 * 2. **The `application/` prefix may be omitted** to keep tokens compact,
 *    *but only when the remaining value contains no `/`*. A recipient "MUST
 *    treat it as if `application/` were prepended".
 *
 * Hence the `/` test rather than a fixed list of spellings: `at+jwt` →
 * `application/at+jwt`, while a value that already carries a type/subtype
 * (`application/at+jwt`, or a non-`application` type such as `text/plain`) is
 * left alone instead of being mangled into `application/text/plain`.
 *
 * No other liberty is taken — surrounding whitespace is *not* stripped, since
 * a `typ` of `' JWT '` is not a legal media type and a lenient parser here
 * would only widen the surface an attacker can probe.
 *
 * @param typ - Raw `typ` value from a token header or a caller's allow-list.
 * @returns The lower-cased media type with an explicit `application/` prefix.
 * @internal
 * @see {@link https://www.rfc-editor.org/rfc/rfc7515#section-4.1.9} RFC 7515 §4.1.9
 */
export const normalizeTyp = (typ: string): string => {
  const lowered = typ.toLowerCase();
  return lowered.includes('/') ? lowered : `application/${lowered}`;
};

/**
 * Builds the set of normalised `typ` values verification will accept.
 *
 * A caller-supplied allow-list always wins — it may narrow the default set
 * (accept access tokens only) or widen it (a bespoke token type). Passing an
 * empty array is taken literally and accepts nothing.
 *
 * @param typ - `options.typ`: a single value, a list, or `undefined` for
 *   {@link JWT_DEFAULT_TYPES}.
 * @returns Normalised values to match a token's `typ` against.
 * @internal
 */
export const resolveAcceptedTypes = (
  typ?: string | readonly string[],
): ReadonlySet<string> => {
  const allowed = typ === undefined
    ? JWT_DEFAULT_TYPES
    : typeof typ === 'string'
    ? [typ]
    : typ;
  return new Set(allowed.map(normalizeTyp));
};

/**
 * Convert a signature produced by the `sign/` module into the **base64url**
 * encoding RFC 7515 mandates for a JWT's signature segment, so tokens
 * interoperate with standard JWT implementations.
 *
 * The `sign/` module emits hex for HMAC and base64 for RSA and ECDSA, so only
 * the input alphabet differs — the *bytes* are passed through untouched. That
 * matters most for ECDSA: `signEC` already returns the fixed-width `R‖S`
 * concatenation RFC 7515 §3.4 requires, and re-encoding base64 → base64url
 * preserves it exactly. Any future change that normalised EC signatures
 * through a different representation (DER, say) would corrupt them here.
 *
 * @internal
 */
export const toJwtSignature = (
  signature: string,
  family: JWTAlgorithmFamily,
): string =>
  encodeBase64Url(
    family === 'HMAC' ? decodeHex(signature) : decodeBase64(signature),
  );

/**
 * Convert a JWT base64url signature segment back into the encoding the `sign/`
 * verifier expects (hex for HMAC, base64 for RSA and ECDSA).
 *
 * @throws {Error} When `signature` is not valid base64url.
 * @internal
 */
export const fromJwtSignature = (
  signature: string,
  family: JWTAlgorithmFamily,
): string => {
  const bytes = decodeBase64Url(signature);
  return family === 'HMAC' ? encodeHex(bytes) : encodeBase64(bytes);
};

/**
 * Detects whether a key string is PEM-encoded (asymmetric key material) as
 * opposed to a raw HMAC secret.
 *
 * PEM keys carry an unmistakable `-----BEGIN ... KEY-----` armor. The regex
 * mirrors the one used by the signing layer's PEM parser so that detection
 * here agrees exactly with what verification will actually accept.
 *
 * @param key - Key material supplied to verification.
 * @returns `true` when the key looks like a PEM key, `false` otherwise.
 * @internal
 */
export const isPEMKey = (key: string): boolean =>
  /-----BEGIN [A-Z ]+-----/.test(key);

/**
 * Derives the {@link JWTAlgorithmFamily} a key may be used with, purely from
 * the *shape* of the key material.
 *
 * This is the cornerstone of the defense against the JWT **algorithm
 * confusion** attack. By binding the verification primitive to the key shape
 * rather than to the attacker-controlled `alg` header, a public key can never
 * be routed into HMAC verification (and a raw secret can never be routed into
 * RSA or ECDSA verification). An attacker who knows the RSA *public* key
 * therefore cannot forge an `HS256` token (HMAC-keyed with the public-key
 * bytes) and have it accepted as a valid `RS256` token.
 *
 * Since the key may now be a `CryptoKey` or JWK rather than a string, the
 * shape is read from whichever form was supplied — the DER inside a PEM, the
 * `algorithm` of a `CryptoKey`, or the `kty`/`crv` of a JWK — and never from
 * the token.
 *
 * @param key - Key material supplied to verification.
 * @returns `'EC'`, `'RSA'` or `'HMAC'` according to the key material.
 * @throws {Error} When the key is not usable key material at all (an
 *   unsupported curve, a JWK with an unusable `kty`, a `CryptoKey` whose
 *   algorithm cannot sign or verify).
 * @internal
 * @see {@link https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/}
 */
export const keyAlgorithmFamily = (key: SigningKey): JWTAlgorithmFamily =>
  describeKey(key).family;

/**
 * Reads the curve of an EC key, for binding an `ES*` algorithm to its key.
 *
 * @param key - Key material supplied to signing or verification.
 * @returns The key's {@link ECCurve}, or `undefined` when it is not an EC key.
 * @throws {Error} When the key is not usable key material at all.
 * @internal
 */
export const keyCurve = (key: SigningKey): ECCurve | undefined =>
  describeKey(key).curve;

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

  // The comparisons below are arithmetic (`payload.exp + tolerance`,
  // `payload.nbf - tolerance`, `now - payload.iat`). A non-numeric time claim
  // in a legitimately-signed token minted elsewhere — e.g. `exp` as a string —
  // would turn `+` into string concatenation and produce a value far larger
  // than `now`, so an expired token would read as still valid. On issuance
  // these are guarded by validateNumericClaims; the verify path never ran that
  // check, so reject any present-but-non-numeric NumericDate claim (RFC 7519
  // §4.1) up front. `iat` stays optional here (it is only used for maxAge).
  for (const claim of ['exp', 'nbf', 'iat'] as const) {
    if (payload[claim] !== undefined && typeof payload[claim] !== 'number') {
      throw new JWTError('INVALID_PAYLOAD', {
        causeMessage: `Time claim (${claim}) must be a number`,
        claim,
      });
    }
  }

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

  // Check maximum age. maxAge is a freshness bound ("token must not be older
  // than this"), computed from `iat`. RFC 7519 §4.1.6 makes `iat` OPTIONAL and
  // foreign issuers routinely omit it, so a token could carry neither `exp` nor
  // `iat` — silently skipping the check there would accept an arbitrarily old
  // token while the caller believed maxAge bounded its lifetime. When a caller
  // asks for maxAge the age must be knowable, so a missing `iat` fails closed
  // (matching jose/jsonwebtoken) rather than passing unchecked.
  if (options.maxAge !== undefined) {
    if (payload.iat === undefined) {
      throw new JWTError('INVALID_CLAIMS', {
        causeMessage:
          "maxAge verification requires an 'iat' claim, but the token has none",
        maxAge: options.maxAge,
      });
    }
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
 * For HMAC algorithms (HS256/384/512), provide a single key.
 * For the asymmetric algorithms — RSA (RS256/384/512, PS256/384/512) and ECDSA
 * (ES256/384/512) — provide separate verify and sign keys, since the key that
 * verifies the old token cannot sign the new one.
 *
 * Each key accepts any {@link SigningKey} form: a PEM string, a `CryptoKey`, or
 * a JWK.
 */
export type RefreshKeyConfig = {
  /**
   * Public key for verifying the existing token (asymmetric algorithms only)
   */
  verifyKey: SigningKey;
  /**
   * Private key for signing the new token (asymmetric algorithms only)
   */
  signKey: SigningKey;
};

/**
 * Distinguishes a {@link RefreshKeyConfig} from a single key.
 *
 * `typeof key === 'string'` is no longer sufficient now that a bare key may be
 * a `CryptoKey` or JWK object, so the discriminator is the presence of both
 * config fields — neither of which appears on any key form.
 *
 * @param value - The `keyOrKeys` argument to {@link refreshJWT}.
 * @returns `true` when the value is a verify/sign key pair.
 * @internal
 */
const isRefreshKeyConfig = (
  value: SigningKey | RefreshKeyConfig,
): value is RefreshKeyConfig =>
  typeof value === 'object' && value !== null && 'verifyKey' in value &&
  'signKey' in value;

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
 * @throws {JWTError} INVALID_HEADER - When the header cannot be decoded, is not
 *   a JSON object, or lacks a valid `alg` (missing or not a non-empty string).
 *   This is always a typed `JWTError`, never a raw `TypeError`, so callers that
 *   read `header.alg` (e.g. `refreshJWT`) get the taxonomy they expect.
 * @throws {JWTError} INVALID_PAYLOAD - When payload cannot be decoded
 *
 * @example
 * ```typescript
 * import { verifyJWT } from '@tundralibs/crypt/JWT';
 *
 * declare const token: string;
 * declare const appropriateKey: string;
 *
 * // Decode token for debugging
 * const { header, payload } = decodeJWT(token);
 * console.log('Algorithm:', header.alg);
 * console.log('Expires:', new Date(payload.exp! * 1000));
 *
 * // Check token contents before verification
 * const { payload: claims } = decodeJWT(token);
 * if (claims.iss !== 'expected-issuer') {
 *   console.log('Wrong issuer, skipping verification');
 * } else {
 *   // Now verify with appropriate key
 *   await verifyJWT(token, appropriateKey);
 * }
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
  let parsedHeader: unknown;
  try {
    const headerJson = new TextDecoder().decode(decodeBase64Url(headerBase64));
    parsedHeader = JSON.parse(headerJson);
  } catch (error) {
    throw new JWTError('INVALID_HEADER', {
      causeMessage: 'Invalid JWT header',
    }, error instanceof Error ? error : undefined);
  }

  // A JOSE header MUST be a JSON object (RFC 7515 §4). `JSON.parse` also accepts
  // `null` and other primitives; returning `{ header: null }` silently would
  // cascade into refreshJWT (which reads `header.alg`) as a raw TypeError, so
  // reject a non-object header here as INVALID_HEADER instead.
  if (
    parsedHeader === null || typeof parsedHeader !== 'object' ||
    Array.isArray(parsedHeader)
  ) {
    throw new JWTError('INVALID_HEADER', {
      causeMessage: 'JWT header must be a JSON object',
    });
  }

  // `alg` is REQUIRED and MUST be a non-empty string (RFC 7515 §4.1.1).
  // Object-ness alone is not enough: refreshJWT reads `header.alg` and calls
  // algorithmFamily (`alg.startsWith(...)`) *before* verifyJWT runs, so a header
  // that is a JSON object but whose `alg` is missing (`{}`, `{"typ":"JWT"}`) or
  // not a string (`{"alg":123}`, `{"alg":null}`, `{"alg":{}}`) would otherwise
  // surface as a raw TypeError outside the JWTError contract on an
  // unauthenticated malformed-token probe. Validate it here so every
  // decodeJWT caller — including refreshJWT — can trust `header.alg` is a
  // usable string, mirroring the `!header.alg` guard verifyJWT already applies.
  const alg = (parsedHeader as { alg?: unknown }).alg;
  if (typeof alg !== 'string' || alg.length === 0) {
    throw new JWTError('INVALID_HEADER', {
      causeMessage:
        'Invalid JWT header format - "alg" (algorithm) is required and must be a non-empty string',
    });
  }
  const header = parsedHeader as JWTHeader;

  // Decode payload
  let parsedPayload: unknown;
  try {
    const payloadJson = new TextDecoder().decode(
      decodeBase64Url(payloadBase64),
    );
    parsedPayload = JSON.parse(payloadJson);
  } catch (error) {
    throw new JWTError('INVALID_PAYLOAD', {
      causeMessage: 'Invalid JWT payload',
    }, error instanceof Error ? error : undefined);
  }

  // The JWT Claims Set MUST be a JSON object (RFC 7519 §7.2); reject `null` and
  // other non-object payloads rather than handing them back typed as
  // JWTPayload.
  if (
    parsedPayload === null || typeof parsedPayload !== 'object' ||
    Array.isArray(parsedPayload)
  ) {
    throw new JWTError('INVALID_PAYLOAD', {
      causeMessage: 'JWT payload must be a JSON object',
    });
  }
  const payload = parsedPayload as JWTPayload;

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
 * **For RSA (RS256/384/512, PS256/384/512) and ECDSA (ES256/384/512):** Provide
 * separate keys using {@link RefreshKeyConfig}
 *
 * @param token - JWT token to refresh
 * @param keyOrKeys - For HMAC: a single secret key. For the asymmetric
 *   algorithms: a {@link RefreshKeyConfig} with verifyKey (public) and signKey
 *   (private). Each key may be a PEM string, a `CryptoKey` or a JWK.
 * @param extendBy - Number of seconds to extend expiration (default: 3600 = 1 hour)
 * @param kid - Optional Key ID for the new token
 *
 * @returns Promise resolving to the new JWT token with extended expiration
 *
 * @throws {JWTError} All errors from `verifyJWT` if token is invalid
 * @throws {JWTError} All errors from `issueJWT` if new token creation fails
 * @throws {JWTError} INVALID_SECRET - When an asymmetric token is refreshed
 *   with a single key, or an HMAC token with a {@link RefreshKeyConfig}
 *
 * @example
 * ```typescript
 * declare const oldToken: string;
 * declare const token: string;
 * declare const ecToken: string;
 * declare const hmacSecret: string;
 * declare const publicKey: string;
 * declare const privateKey: string;
 * declare const publicKeyPEM: string;
 * declare const privateKeyPEM: string;
 * declare const ecPublicKey: string;
 * declare const ecPrivateKey: string;
 *
 * // HMAC token refresh (same secret for verify and sign)
 * const hmacToken = await refreshJWT(oldToken, 'secret-key');
 *
 * // HMAC with custom extension
 * const longerToken = await refreshJWT(oldToken, 'secret-key', 7200); // 2 hours
 *
 * // RSA token refresh (separate public/private keys)
 * const rsaToken = await refreshJWT(
 *   oldToken,
 *   {
 *     verifyKey: publicKeyPEM,  // Verify old token with public key
 *     signKey: privateKeyPEM     // Sign new token with private key
 *   },
 *   3600
 * );
 *
 * // RSA with key ID
 * const keyedToken = await refreshJWT(
 *   oldToken,
 *   { verifyKey: publicKey, signKey: privateKey },
 *   3600,
 *   'key-2024-02'
 * );
 *
 * // ECDSA token refresh — same shape as RSA
 * const ecRefreshed = await refreshJWT(
 *   ecToken,
 *   { verifyKey: ecPublicKey, signKey: ecPrivateKey },
 * );
 *
 * // Automatic key detection based on algorithm (everything but HS* is a pair)
 * const { header } = decodeJWT(token);
 * const newToken = header.alg.startsWith('HS')
 *   ? await refreshJWT(token, hmacSecret)
 *   : await refreshJWT(token, { verifyKey: publicKey, signKey: privateKey });
 * ```
 *
 * @see {@link verifyJWT} For token verification
 * @see {@link issueJWT} For token creation
 */
export const refreshJWT = async <T extends JWTPayload = JWTPayload>(
  token: string,
  keyOrKeys: SigningKey | RefreshKeyConfig,
  extendBy: number = 3600,
  kid?: string,
): Promise<string> => {
  // Lazy import to avoid circular dependency
  const { issueJWT } = await import('./issue.ts');
  const { verifyJWT } = await import('./verify.ts');

  // Decode to get algorithm
  const { header } = decodeJWT(token);

  // Every asymmetric family needs the { verifyKey, signKey } shape, because the
  // public key that verifies the old token cannot sign the new one: RSA covers
  // RSASSA-PKCS1-v1_5 (RS*) and RSASSA-PSS (PS*), EC covers ECDSA (ES*).
  const family = algorithmFamily(header.alg);
  const config = isRefreshKeyConfig(keyOrKeys);

  // Validate key configuration based on algorithm
  if (family !== 'HMAC' && !config) {
    throw new JWTError('INVALID_SECRET', {
      causeMessage:
        `${family} tokens require separate verifyKey and signKey. ` +
        'Provide { verifyKey, signKey }',
      algorithm: header.alg,
    });
  }

  if (family === 'HMAC' && config) {
    throw new JWTError('INVALID_SECRET', {
      causeMessage: 'HMAC tokens require a single secret key string',
      algorithm: header.alg,
    });
  }

  // Determine keys for verification and signing
  const verifyKey = config ? keyOrKeys.verifyKey : keyOrKeys;
  const signKey = config ? keyOrKeys.signKey : keyOrKeys;

  // Verify the current token. Pin the algorithm to the one declared in the
  // header we just decoded so verification never silently falls back to a
  // different primitive. Combined with the key-shape guard inside verifyJWT
  // (and the key-config checks above), this closes the algorithm-confusion
  // vector on the refresh path.
  const payload = await verifyJWT<T>(token, verifyKey, {
    algorithm: header.alg,
  });

  // Update expiration time
  const now = Math.floor(Date.now() / 1000);
  const newPayload = {
    ...payload,
    iat: now,
    exp: now + extendBy,
  };

  // Issue new token with the same algorithm and token type. Preserving `typ`
  // keeps a refreshed RFC 9068 access token an access token instead of
  // silently downgrading it to a plain `JWT` — the type was already vetted
  // against the accepted set by the verification above.
  return await issueJWT(header.alg, newPayload, signKey, {
    kid: kid ?? header.kid,
    typ: header.typ,
  });
};
