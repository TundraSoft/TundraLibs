import { JWTError } from './errors/mod.ts';
import type { JWTHeader, JWTPayload, JWTVerifyOptions } from './types/mod.ts';
import { decodeBase64Url } from '@std/encoding';
// Internal cross-module use: the JWT layer resolves the key itself so key
// failures and signature failures stay distinguishable (see below).
import {
  importSigningKey,
  type SigningKey,
  verifyEC,
  verifyHMAC,
  verifyRSA,
} from '../sign/mod.ts';
import {
  algorithmCurve,
  algorithmFamily,
  fromJwtSignature,
  JWT_ALGORITHM_MAP,
  keyAlgorithmFamily,
  keyCurve,
  normalizeTyp,
  resolveAcceptedTypes,
  rsaScheme,
  validateClaims,
} from './helpers.ts';

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
 * ## Security — algorithm-confusion protection
 *
 * This function does **not** trust the token's `alg` header to select the
 * verification primitive. Doing so enables the classic JWT *algorithm
 * confusion* attack: a service that verifies `RS256` tokens with an RSA public
 * key can be tricked by an attacker into accepting an `HS256` token that was
 * HMAC-signed using the (public, attacker-known) key bytes as the secret.
 *
 * Three layers prevent this:
 *
 * 1. **Key-shape binding (always on).** The verification primitive is chosen
 *    from the *shape of the `key` argument*, not the header. An RSA key can
 *    only ever verify `RS*`/`PS*` tokens, an EC key only `ES*` tokens, and a
 *    raw secret only `HS*` tokens. A public key is therefore never routed into
 *    HMAC verification, so a forged `HS256` token is rejected with
 *    `UNSUPPORTED_ALGORITHM` before any signature check runs.
 * 2. **Curve binding (always on, `ES*` only).** RFC 7518 §3.4 binds each ECDSA
 *    algorithm to exactly one curve — `ES256`→P-256, `ES384`→P-384,
 *    `ES512`→**P-521**. A key on any other curve is refused with
 *    `UNSUPPORTED_ALGORITHM` rather than merely failing to verify, so "wrong
 *    key" stays distinguishable from "forged token".
 * 3. **Algorithm pinning (recommended).** Pass `options.algorithm` with the
 *    exact algorithm (or an allow-list) you expect. The token's `alg` must be
 *    in that set or verification fails. Always pin in production code.
 *
 * ## Key formats
 *
 * `key` accepts a PEM string (or raw secret for `HS*`), an already-imported
 * `CryptoKey`, or a JWK — see {@link SigningKey}. A `CryptoKey` or JWK is
 * *validated against the operation* rather than trusted: its algorithm, curve,
 * hash, public/private type and usages must all permit what is being asked, and
 * a JWK's own `alg`, `use` and `key_ops` must not contradict it. This makes a
 * JWKS entry usable directly, without converting it to PEM first.
 *
 * ## Token type (`typ`)
 *
 * By default `typ` is **not checked**. RFC 7519 §5.1 makes it OPTIONAL and
 * says it "is ignored by JWT implementations; any processing of this parameter
 * is performed by the JWT application" — and real tokens depend on that
 * latitude: Apple's OIDC `id_token` header is just `{kid, alg}`, and
 * `secevent+jwt` (RFC 8417), `dpop+jwt` (RFC 9449) and OIDC's `logout+jwt` are
 * all legitimate types a general-purpose verifier cannot enumerate.
 *
 * Pass `options.typ` to opt in, which makes `typ` **mandatory**: the header
 * must carry one *and* it must match, so a token cannot evade a pin by
 * omitting the header. That is how you stop *cross-type confusion*, where a
 * token minted for one purpose (an OIDC `id_token`, a SET) is replayed at an
 * endpoint expecting another — an RFC 9068 resource server pins
 * `{ typ: 'at+jwt' }`. Note the primary defenses against that attack are
 * `aud`/`iss` and the algorithm pinning above; `typ` is supplementary, which
 * is why it is opt-in.
 *
 * Values are compared as media types per RFC 7515 §4.1.9: case-insensitively,
 * with an omitted `application/` prefix implied, so `'at+jwt'`, `'AT+JWT'` and
 * `'application/at+jwt'` are equivalent.
 *
 * @param token - JWT token string to verify
 * @param key - Secret for HMAC (`HS*`) or public key for the asymmetric
 *   algorithms, as a PEM string, `CryptoKey` or JWK ({@link SigningKey}). The
 *   key's shape pins the algorithm family — an HMAC secret can never verify an
 *   RSA or EC token and vice versa — and, for `ES*`, its curve pins the exact
 *   algorithm.
 * @param options - Verification options for algorithm pinning, token-type
 *   pinning and claim validation. Set `options.algorithm` to pin the expected
 *   algorithm(s) and `options.typ` to pin the accepted token type(s).
 *
 * @returns Promise resolving to the validated JWT payload
 *
 * @throws {JWTError} INVALID_FORMAT - When token format is invalid
 * @throws {JWTError} INVALID_SECRET - When the key is empty, is not a string,
 *   `CryptoKey` or JWK, or is not usable key material (an unsupported curve, a
 *   JWK with an unusable `kty`, a `CryptoKey` that cannot verify)
 * @throws {JWTError} INVALID_HEADER - When the JWT header is malformed, or —
 *   only when `options.typ` is supplied — when the header's `typ` is missing
 *   or not in the accepted set
 * @throws {JWTError} UNSUPPORTED_ALGORITHM - When the algorithm is not
 *   supported, is not in `options.algorithm`, does not match the key's family,
 *   or (for `ES*`) does not match the key's curve
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
 * import { JWTError } from '@tundralibs/crypt/JWT';
 *
 * declare const token: string;
 * declare const accessToken: string;
 * declare const idToken: string;
 * declare const clientId: string;
 * declare const publicKeyPEM: string;
 * declare const header: { kid?: string };
 * declare const jwks: { keys: (JsonWebKey & { kid?: string })[] };
 *
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
 * // RSA verification with claim validation. The claim keys are `aud`, `iss`
 * // and `jti` (not `audience`/`issuer`/`jwtId`) — unknown keys are silently
 * // ignored, so a wrong name means that check never runs.
 * const rsaPayload = await verifyJWT(token, publicKeyPEM, {
 *   algorithm: 'RS256',
 *   aud: 'api.example.com',
 *   iss: 'auth.example.com',
 *   maxAge: 3600, // 1 hour max age
 *   clockTolerance: 30 // 30 seconds tolerance
 * });
 *
 * // Verification with required claims
 * const strictPayload = await verifyJWT(token, 'my-secret-key', {
 *   requiredClaims: ['sub', 'iat', 'role'],
 *   jti: 'unique-token-id-123'
 * });
 *
 * // Resource server: accept RFC 9068 access tokens only, so an id_token
 * // replayed here is rejected on `typ` before any claim is trusted.
 * const claims = await verifyJWT(accessToken, publicKeyPEM, {
 *   algorithm: 'RS256',
 *   typ: 'at+jwt',
 * });
 *
 * // ECDSA with a JWK straight from a provider's JWKS — no PEM conversion.
 * const jwk = jwks.keys.find((k) => k.kid === header.kid)!;
 * const idClaims = await verifyJWT(idToken, jwk, {
 *   algorithm: 'ES256',   // binds the key to P-256
 *   iss: 'https://accounts.example.com',
 *   aud: clientId,
 * });
 * ```
 *
 * @see {@link issueJWT} For JWT creation
 * @see {@link JWTVerifyOptions} For verification options details
 * @see {@link https://tools.ietf.org/html/rfc7519} RFC 7519 - JSON Web Token (JWT)
 */
export const verifyJWT = async <T extends JWTPayload = JWTPayload>(
  token: string,
  key: SigningKey,
  options: JWTVerifyOptions = {},
): Promise<T> => {
  if (!token || typeof token !== 'string') {
    throw new JWTError('INVALID_FORMAT', {
      causeMessage: 'Token must be a non-empty string',
    });
  }

  if (
    key === null || key === undefined ||
    (typeof key === 'string' ? key.length === 0 : typeof key !== 'object')
  ) {
    throw new JWTError('INVALID_SECRET', {
      causeMessage:
        'Key must be a non-empty string, a CryptoKey, or a JWK object',
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
  // `null`, numbers, strings and arrays, and header parsing runs *before*
  // signature verification, so this is reachable with unauthenticated input: a
  // header segment of `base64url('null')` would parse to `null` and make the
  // `header.alg` dereference below throw a raw TypeError outside the JWTError
  // taxonomy, breaking the documented `instanceof JWTError` handling. Reject any
  // non-object header as INVALID_HEADER up front.
  if (
    parsedHeader === null || typeof parsedHeader !== 'object' ||
    Array.isArray(parsedHeader)
  ) {
    throw new JWTError('INVALID_HEADER', {
      causeMessage: 'JWT header must be a JSON object',
    });
  }
  const header = parsedHeader as JWTHeader;

  // `alg` is mandatory (RFC 7515 §4.1.1). `typ` is not — see below — but if a
  // producer sends one it must at least be a string.
  if (
    !header.alg ||
    (header.typ !== undefined && typeof header.typ !== 'string')
  ) {
    throw new JWTError('INVALID_HEADER', {
      causeMessage: 'Invalid JWT header format',
      header,
    });
  }

  // `typ` is OPTIONAL (RFC 7519 §5.1), and the same section states it "is
  // ignored by JWT implementations; any processing of this parameter is
  // performed by the JWT application". Real tokens depend on that latitude:
  // Apple's OIDC id_token header carries only `kid`/`alg`, and live profiles
  // such as `secevent+jwt` (RFC 8417), `dpop+jwt` (RFC 9449) and OIDC's
  // `logout+jwt` use types no general-purpose verifier can enumerate. So the
  // default posture is to ignore `typ` entirely — rejecting a typ-less or
  // unfamiliar token here would refuse perfectly valid JWTs.
  //
  // SECURITY: cross-type token confusion is defended by `aud` (an id_token is
  // audienced to the client, an access token to the resource server), `iss`,
  // and the algorithm pinning below — not by `typ` alone. `typ` is a
  // supplementary signal, so a caller whose profile mandates one opts in:
  // passing `options.typ` makes it REQUIRED, meaning the header must carry a
  // `typ` *and* it must match. An RFC 9068 resource server does exactly that
  // with `{ typ: 'at+jwt' }`. Both sides normalise per RFC 7515 §4.1.9, so
  // case and an omitted `application/` prefix never decide whether a token is
  // trusted.
  if (options.typ !== undefined) {
    const allowedTypes = resolveAcceptedTypes(options.typ);
    const accepted = [...allowedTypes].join(', ');
    if (
      header.typ === undefined || !allowedTypes.has(normalizeTyp(header.typ))
    ) {
      throw new JWTError('INVALID_HEADER', {
        causeMessage: header.typ === undefined
          ? `Expected a token type in [${accepted}] but the header carries no 'typ'`
          : `Unexpected token type: '${header.typ}' is not in the accepted set [${accepted}]`,
        header,
        actualType: header.typ,
        acceptedTypes: [...allowedTypes],
      });
    }
  }

  // Validate algorithm
  const supportedAlgorithms = [
    'HS256',
    'HS384',
    'HS512',
    'RS256',
    'RS384',
    'RS512',
    'PS256',
    'PS384',
    'PS512',
    'ES256',
    'ES384',
    'ES512',
  ];
  if (!supportedAlgorithms.includes(header.alg)) {
    throw new JWTError('UNSUPPORTED_ALGORITHM', {
      causeMessage: `Unsupported algorithm: ${header.alg}`,
      algorithm: header.alg,
      supportedAlgorithms,
    });
  }

  // Pin the algorithm to the caller's allow-list when supplied. `algorithm`
  // may be a single algorithm or an array of acceptable algorithms; the
  // token's `alg` must be one of them. Pinning is the first line of defense
  // against algorithm-confusion attacks and callers are strongly encouraged
  // to set it.
  if (options.algorithm !== undefined) {
    const allowed = Array.isArray(options.algorithm)
      ? options.algorithm
      : [options.algorithm];
    if (!allowed.includes(header.alg)) {
      throw new JWTError('UNSUPPORTED_ALGORITHM', {
        causeMessage:
          `Algorithm mismatch: token alg '${header.alg}' is not in the ` +
          `allowed set [${allowed.join(', ')}]`,
        expectedAlgorithm: options.algorithm,
        actualAlgorithm: header.alg,
      });
    }
  }

  // SECURITY: bind the verification primitive to the *shape of the key*, not
  // to the attacker-controlled `alg` header. An RSA key may only verify RS*/PS*
  // tokens, an EC key only ES* tokens, and a raw secret only HS* tokens. This
  // makes the classic JWT algorithm-confusion attack impossible even when the
  // caller forgets to pin `options.algorithm`: a public key is never handed to
  // the HMAC primitive, so an HS256 token forged with the public-key bytes is
  // rejected outright instead of verifying.
  //
  // The shape is read from whichever key form the caller supplied — the DER
  // inside a PEM, a CryptoKey's `algorithm`, a JWK's `kty`/`crv` — so widening
  // the accepted key types did not widen what a token can talk us into.
  let keyFamily: ReturnType<typeof keyAlgorithmFamily>;
  try {
    keyFamily = keyAlgorithmFamily(key);
  } catch (error) {
    throw new JWTError('INVALID_SECRET', {
      causeMessage: error instanceof Error ? error.message : String(error),
    }, error instanceof Error ? error : undefined);
  }
  const headerFamily = algorithmFamily(header.alg);
  if (keyFamily !== headerFamily) {
    throw new JWTError('UNSUPPORTED_ALGORITHM', {
      causeMessage:
        `Algorithm confusion detected: a ${keyFamily} key cannot verify a ` +
        `${headerFamily} token (alg '${header.alg}'). RSA keys may only ` +
        `verify RS*/PS* tokens, EC keys only ES* tokens, and secrets only ` +
        `HS* tokens.`,
      algorithm: header.alg,
      keyFamily,
      headerFamily,
    });
  }

  // SECURITY: for ES* the family check is not enough — RFC 7518 §3.4 binds each
  // algorithm to exactly one curve, so an ES256 token must be verified with a
  // P-256 key and nothing else. Without this, a caller holding a P-384 key
  // would hand it to a verifier asked for ES256; the mismatch would surface
  // only as an invalid signature, indistinguishable from a forgery, and a
  // future runtime that was laxer about curve/hash pairing would accept it.
  const requiredCurve = algorithmCurve(header.alg);
  if (requiredCurve !== undefined) {
    const suppliedCurve = keyCurve(key);
    if (suppliedCurve !== requiredCurve) {
      throw new JWTError('UNSUPPORTED_ALGORITHM', {
        causeMessage:
          `Curve mismatch: alg '${header.alg}' requires an EC key on ` +
          `${requiredCurve} but the supplied key is on ${suppliedCurve}`,
        algorithm: header.alg,
        expectedCurve: requiredCurve,
        actualCurve: suppliedCurve,
      });
    }
  }

  // Verify signature. The primitive is selected from the key-derived family
  // (validated above to equal the header family), never from the header alone,
  // so the trust anchor is the key the caller supplied — not the token.
  const data = `${headerBase64}.${payloadBase64}`;
  const hashAlgorithm = JWT_ALGORITHM_MAP[header.alg];

  // Import the key *before* the signature block, so a problem with the key is
  // reported as INVALID_SECRET rather than being swallowed by the catch below
  // and mislabelled INVALID_SIGNATURE. The distinction matters: "your JWKS
  // entry says alg RS256" and "this token was forged" call for completely
  // different responses, and only one of them is an attack.
  let verificationKey: CryptoKey;
  try {
    verificationKey = await importSigningKey(
      key,
      keyFamily === 'HMAC'
        ? { family: 'HMAC', purpose: 'verify', hash: hashAlgorithm }
        : keyFamily === 'EC'
        ? {
          family: 'EC',
          purpose: 'verify',
          hash: hashAlgorithm,
          curve: requiredCurve,
        }
        : {
          family: 'RSA',
          purpose: 'verify',
          hash: hashAlgorithm,
          scheme: rsaScheme(header.alg),
        },
    );
  } catch (error) {
    throw new JWTError('INVALID_SECRET', {
      causeMessage: error instanceof Error ? error.message : String(error),
      algorithm: header.alg,
    }, error instanceof Error ? error : undefined);
  }

  try {
    // The JWT signature segment is base64url (RFC 7515); convert back to the
    // encoding the sign-module verifier expects (hex for HMAC, base64 for RSA
    // and ECDSA). The bytes are preserved, so an ECDSA signature reaches
    // `verifyEC` as the raw R‖S RFC 7515 §3.4 requires. A malformed signature
    // throws here and is caught below as INVALID_SIGNATURE.
    const sig = fromJwtSignature(signature, keyFamily);
    let isValid: boolean;
    if (keyFamily === 'HMAC') {
      isValid = await verifyHMAC(data, sig, verificationKey, {
        hashAlgorithm,
      });
    } else if (keyFamily === 'EC') {
      isValid = await verifyEC(data, sig, verificationKey, {
        hashAlgorithm,
        curve: requiredCurve,
      });
    } else {
      isValid = await verifyRSA(data, sig, verificationKey, {
        hashAlgorithm,
        scheme: rsaScheme(header.alg),
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

  // The JWT Claims Set MUST be a JSON object (RFC 7519 §7.2). `JSON.parse` also
  // accepts `null`, numbers, strings and arrays; a validly-signed token minted
  // by another stack could carry any of them. Without this guard `null` makes
  // validateClaims read `payload.exp` on null (a raw TypeError), a bare number
  // is returned typed as JWTPayload in violation of the declared return type,
  // and requiredClaims' `claim in payload` throws on a primitive. Reject every
  // non-object payload as INVALID_PAYLOAD.
  if (
    parsedPayload === null || typeof parsedPayload !== 'object' ||
    Array.isArray(parsedPayload)
  ) {
    throw new JWTError('INVALID_PAYLOAD', {
      causeMessage: 'JWT payload must be a JSON object',
    });
  }
  const payload = parsedPayload as T;

  // Validate claims
  validateClaims(payload, options);

  return payload;
};
