/**
 * @fileoverview JWKS-backed `id_token` verification for {@link OAuthClient}.
 *
 * Providers with **no userinfo endpoint** (Apple, and any `OIDC` issuer
 * whose discovery document omits `userinfo_endpoint`) hand pact the user's
 * identity inside the `id_token` returned by the code→token exchange. That
 * exchange is a direct server-to-server TLS POST, so OIDC Core §3.1.3.7
 * permits skipping signature validation — checking the signature against
 * the provider's published key set is defense-in-depth: it removes the
 * token endpoint's *response body* from the trusted computing base.
 *
 * ## Division of labour with `@tundralibs/crypt`
 *
 * Everything cryptographic belongs to crypt. `verifyJWT` accepts a JWKS
 * entry as a JWK directly, validates that key *against the operation*
 * (family, curve, hash, public-vs-private, `use`/`key_ops`/`alg`), binds
 * the verification primitive to the key's shape rather than the token's
 * header, checks the signature, and validates `iss`/`aud`/`exp`/`nbf`.
 *
 * This module owns only what crypt has no view of: fetching and caching
 * the key set, selecting by `kid`, refreshing on rotation, the
 * OIDC-specific claims RFC 7519 does not define (`azp`, `nonce`) plus the
 * requirement that `exp` be *present*, and the availability policy below.
 *
 * ## Algorithm confusion
 *
 * The verification algorithm is taken from the **JWKS entry**, never from
 * the token header. When the JWK declares `alg` that single value is
 * pinned, so a header claiming anything else is refused; when it does
 * not, the pin is the asymmetric allow-list and crypt's key-shape binding
 * rejects any algorithm the key cannot carry. Symmetric algorithms
 * (`HS*`) and `none` are never in the pin — a JWKS key is public, so an
 * `HS256` token "signed" with the public key bytes is a forgery attempt
 * by construction.
 *
 * @module
 */

import { decodeJWT, JWTError, verifyJWT } from '@tundralibs/crypt/JWT';
import { PactOAuthError } from '../errors/mod.ts';

/** `fetch` supplier — late-bound so the client's test seam stays live. */
type FetchRef = () => typeof globalThis.fetch;

/**
 * Availability policy when the key set cannot be obtained: `'PREFERRED'`
 * (default) degrades to claim-validated decoding and reports the
 * downgrade; `'REQUIRED'` fails the login. Signature/claim failures are
 * fatal under both.
 */
export type IdTokenVerificationPolicy = 'PREFERRED' | 'REQUIRED';

/** Construction options for {@link IdTokenVerifier}. */
export type IdTokenVerifierOptions = {
  /** @default 'PREFERRED' */
  policy?: IdTokenVerificationPolicy;
  /** JWKS cache lifetime, ms. @default 3600000 */
  ttl?: number;
  /** Notified when verification degraded to decode-only. */
  onDegraded?: (reason: string) => void;
};

/** Resolved endpoints + expected claim values for one verification. */
export type IdTokenContext = {
  /** The provider's JWKS endpoint (https), when it publishes one. */
  jwksUri?: string;
  /** Expected `iss` claim. */
  issuer?: string;
  /** Expected `aud` claim (the client id). */
  audience: string;
  /** Expected `nonce` claim — fail-closed once supplied. */
  nonce?: string;
};

/**
 * Asymmetric JWS algorithms this verifier will pin. Deliberately excludes
 * `HS*` (symmetric — never valid against a *published* key) and `none`.
 */
const ALLOWED_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
] as const;

/** An asymmetric JWS algorithm this verifier can pin. */
type IdTokenAlgorithm = typeof ALLOWED_ALGORITHMS[number];

/** Seconds of clock skew tolerated on `exp`/`nbf` (third-party clocks). */
const CLOCK_TOLERANCE_SECONDS = 60;

/** Default JWKS cache lifetime — one hour. */
const DEFAULT_JWKS_TTL_MS = 3_600_000;

/**
 * Floor between forced (unknown-`kid`) JWKS refreshes. Without a cooldown,
 * a caller replaying tokens carrying random `kid`s would turn every login
 * into an outbound fetch and make pact an amplifier against the provider's
 * key endpoint.
 */
const JWKS_MIN_REFRESH_MS = 30_000;

/** Hard timeout on a single JWKS fetch — a stalling host must not hang login. */
const JWKS_FETCH_TIMEOUT_MS = 10_000;

/** Reject a JWKS response whose declared size exceeds this (256 KiB). */
const MAX_JWKS_BYTES = 262_144;

/** Cap the number of keys read from a JWKS document. */
const MAX_JWKS_KEYS = 50;

/**
 * One key from a provider's JWKS document — only the fields *this module*
 * reads. The key material itself (`kty`, `crv`, `n`, `e`, `x`, `y`, …) is
 * never inspected here: it is handed to crypt, which validates it against
 * the operation and reports anything unusable as `INVALID_SECRET`.
 */
type RemoteJWK = {
  kid?: unknown;
  alg?: unknown;
  use?: unknown;
};

/** The decoded header of an `id_token` (`typ` may be absent). */
type IdTokenHeader = { alg?: unknown; kid?: unknown };

/**
 * Verifies `id_token`s against a provider's JWKS, with a TTL cache and
 * rotation-aware refresh. One instance per {@link OAuthClient}.
 */
export class IdTokenVerifier {
  private readonly __provider: string;
  private readonly __fetchRef: FetchRef;
  private readonly __policy: IdTokenVerificationPolicy;
  private readonly __ttl: number;
  private readonly __onDegraded?: (reason: string) => void;
  /** Single-slot JWKS cache — one client verifies against one key set. */
  private __cache?: { uri: string; keys: RemoteJWK[]; fetchedAt: number };
  /** In-flight fetch, so concurrent logins share one request. */
  private __inflight?: Promise<RemoteJWK[]>;
  /**
   * When the last *forced* (unknown-`kid`) refresh ran. The cooldown is
   * measured from this, not from the last ordinary fetch, so the first
   * rotation is always picked up immediately while a flood of bogus
   * `kid`s still cannot drive more than one refetch per window.
   */
  private __lastForcedRefresh = 0;

  /**
   * Create a verifier bound to one provider. The policy defaults to
   * `'PREFERRED'`, under which an unreachable key set degrades to
   * decode-only — claims are still validated and `onDegraded` fires —
   * rather than failing the login; `'REQUIRED'` makes that case fatal.
   *
   * @param provider - instance name, used to label errors and reports.
   */
  constructor(
    provider: string,
    fetchRef: FetchRef,
    options: IdTokenVerifierOptions = {},
  ) {
    this.__provider = provider;
    this.__fetchRef = fetchRef;
    this.__policy = options.policy ?? 'PREFERRED';
    this.__ttl = options.ttl ?? DEFAULT_JWKS_TTL_MS;
    this.__onDegraded = options.onDegraded;
  }

  /**
   * Decode an `id_token`, verify its signature against the provider's
   * JWKS, validate the standard claims, and return the payload.
   *
   * Claim validation runs on **both** paths — a token that skipped
   * signature verification because the key set was unreachable is still
   * checked for `iss`/`aud`/`exp`/`nbf`/`nonce`, so the degraded path is
   * strictly stronger than plain decoding.
   *
   * @param idToken - the compact `id_token` from the token exchange
   * @param context - resolved endpoints and expected claim values
   * @returns the validated `id_token` claims
   * @throws {@link PactOAuthError} `OAUTH_PROFILE_FAILED` when the
   *   provider returned no `id_token` or it could not be decoded;
   *   `OAUTH_IDTOKEN_INVALID` on a bad signature, an unusable key, a
   *   disallowed/mismatched `alg`, or a failed claim — always fatal,
   *   under either policy; `OAUTH_JWKS_UNAVAILABLE` when the key set
   *   could not be obtained and the policy is `'REQUIRED'`.
   */
  async verify(
    idToken: string | undefined,
    context: IdTokenContext,
  ): Promise<Record<string, unknown>> {
    if (idToken === undefined) {
      throw new PactOAuthError(
        `Provider '${this.__provider}' returned no id_token to derive the profile from`,
        { code: 'OAUTH_PROFILE_FAILED', provider: this.__provider },
      );
    }
    let header: IdTokenHeader;
    let payload: Record<string, unknown>;
    try {
      // crypt's `decodeJWT` is signature-agnostic parsing only; its
      // `JWTHeader` type declares `typ` as required, which id_tokens may
      // legitimately omit, hence the narrowing cast.
      const decoded = decodeJWT(idToken);
      header = decoded.header as unknown as IdTokenHeader;
      payload = decoded.payload as Record<string, unknown>;
    } catch (cause) {
      throw new PactOAuthError(
        `Provider '${this.__provider}' id_token could not be decoded`,
        { code: 'OAUTH_PROFILE_FAILED', provider: this.__provider },
        cause as Error,
      );
    }

    await this.__verifySignature(idToken, header, context);
    this.__validateClaims(payload, context);
    return payload;
  }

  // ── internals ─────────────────────────────────────────────────────

  /**
   * Verify the token's signature against the resolved JWKS key,
   * delegating the cryptography to crypt's `verifyJWT`. Resolves quietly
   * (after notifying) when the key set is unavailable and the policy is
   * `'PREFERRED'`; throws on every failure crypt reports, regardless of
   * policy.
   *
   * @throws {@link PactOAuthError} `OAUTH_IDTOKEN_INVALID` for anything
   *   crypt refuses; `OAUTH_JWKS_UNAVAILABLE` under the `'REQUIRED'`
   *   policy when the key set could not be obtained.
   */
  private async __verifySignature(
    idToken: string,
    header: IdTokenHeader,
    context: IdTokenContext,
  ): Promise<void> {
    if (context.jwksUri === undefined) {
      return this.__degrade('provider publishes no JWKS endpoint');
    }
    // A plaintext key endpoint would let a network attacker swap the trust
    // anchor wholesale, which defeats the point of checking the signature.
    if (!context.jwksUri.startsWith('https://')) {
      return this.__degrade(
        `JWKS endpoint is not https (${context.jwksUri})`,
      );
    }

    const kid = typeof header.kid === 'string' ? header.kid : undefined;
    let jwk: RemoteJWK | undefined;
    try {
      jwk = await this.__resolveKey(context.jwksUri, kid);
    } catch (cause) {
      return this.__degrade(
        `JWKS fetch failed: ${(cause as Error).message}`,
        cause as Error,
      );
    }
    if (jwk === undefined) {
      // Indistinguishable from a mid-rotation token, so it is classified
      // as unavailability rather than forgery — an attacker gains nothing,
      // because a made-up `kid` still cannot produce a valid signature
      // under any key we hold.
      return this.__degrade(
        kid === undefined
          ? 'id_token carries no kid and the JWKS holds no single usable key'
          : `no JWKS key matches kid '${kid}'`,
      );
    }

    // SECURITY: the algorithm comes from the key, not the token. A JWKS
    // entry that names an algorithm outside the asymmetric allow-list is
    // refused here rather than pinned, so a key set carrying (say) an
    // `oct`/`HS256` entry can never select a symmetric primitive against
    // published material.
    const keyAlgorithm = typeof jwk.alg === 'string' ? jwk.alg : undefined;
    if (keyAlgorithm !== undefined && !isAllowed(keyAlgorithm)) {
      throw this.__reject(
        `JWKS key declares unsupported alg '${keyAlgorithm}'`,
        { keyAlgorithm },
      );
    }

    try {
      await verifyJWT(idToken, jwk as unknown as JsonWebKey, {
        // Pin to the key's own `alg` when it declares one — a header that
        // disagrees is then rejected outright. Otherwise pin the
        // allow-list, and let crypt's key-shape and curve binding refuse
        // any algorithm this key cannot carry. Pinning `ES256` also pins
        // P-256.
        algorithm: keyAlgorithm ?? [...ALLOWED_ALGORITHMS],
        ...(context.issuer !== undefined ? { iss: context.issuer } : {}),
        aud: context.audience,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
    } catch (cause) {
      // SECURITY: every failure crypt reports here is fatal under *both*
      // policies. The key set was obtained, so nothing past this point is
      // an availability problem: `INVALID_SIGNATURE` is a forgery and
      // `INVALID_SECRET` is a key the provider published but crypt
      // refuses to use — degrading either one would convert an attack, or
      // a broken trust anchor, into a silent pass. Degradation is decided
      // *above*, before any key is resolved.
      throw this.__reject(
        cause instanceof JWTError
          ? cause.message
          : `signature could not be checked (${(cause as Error).message})`,
        {
          ...(keyAlgorithm !== undefined ? { keyAlgorithm } : {}),
          ...(typeof header.alg === 'string'
            ? { tokenAlgorithm: header.alg }
            : {}),
          ...(kid !== undefined ? { kid } : {}),
          ...(cause instanceof JWTError ? { jwtCode: cause.context.code } : {}),
        },
        cause as Error,
      );
    }
  }

  /**
   * Apply the availability policy: hard-fail under `'REQUIRED'`, notify
   * and continue (claims still checked) under `'PREFERRED'`.
   */
  private __degrade(reason: string, cause?: Error): void {
    if (this.__policy === 'REQUIRED') {
      throw new PactOAuthError(
        `Provider '${this.__provider}' id_token could not be verified — ${reason}`,
        {
          code: 'OAUTH_JWKS_UNAVAILABLE',
          provider: this.__provider,
          reason,
        },
        cause,
      );
    }
    this.__onDegraded?.(reason);
  }

  /**
   * The JWKS key for `kid`, fetching or refreshing as needed. Returns
   * `undefined` when the key set is readable but holds no match.
   */
  private async __resolveKey(
    uri: string,
    kid: string | undefined,
  ): Promise<RemoteJWK | undefined> {
    const now = Date.now();
    const fresh = this.__cache !== undefined &&
      this.__cache.uri === uri &&
      now - this.__cache.fetchedAt < this.__ttl;
    let keys = fresh ? this.__cache!.keys : await this.__fetchKeys(uri);

    let match = selectKey(keys, kid);
    if (
      match === undefined && fresh &&
      now - this.__lastForcedRefresh >= JWKS_MIN_REFRESH_MS
    ) {
      // Rotation: the cache is valid by the clock but predates this key.
      // Refetch once, rate-limited, then accept the answer either way.
      this.__lastForcedRefresh = now;
      keys = await this.__fetchKeys(uri);
      match = selectKey(keys, kid);
    }
    return match;
  }

  /** Fetch + cache the JWKS, coalescing concurrent callers. */
  private __fetchKeys(uri: string): Promise<RemoteJWK[]> {
    if (this.__inflight !== undefined) return this.__inflight;
    const request = (async () => {
      // Bound the fetch: a host that accepts the connection then stalls must
      // not hang login() forever — the timeout rejection also lets the
      // `'PREFERRED'` policy degrade — and an unbounded body must not OOM.
      const res = await this.__fetchRef()(uri, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`JWKS endpoint returned ${res.status}`);
      }
      const declared = Number(res.headers.get('content-length') ?? '0');
      if (declared > MAX_JWKS_BYTES) {
        throw new Error(`JWKS response too large (${declared} bytes)`);
      }
      const doc = await res.json() as { keys?: unknown };
      if (!Array.isArray(doc.keys)) {
        throw new Error('JWKS document has no `keys` array');
      }
      // Cap the key count so a huge set can't turn every unknown-`kid` lookup
      // into an unbounded scan.
      const keys = (doc.keys as RemoteJWK[]).slice(0, MAX_JWKS_KEYS);
      this.__cache = { uri, keys, fetchedAt: Date.now() };
      return keys;
    })();
    this.__inflight = request;
    // Clear the slot however it settles; a rejection must not be cached as
    // a permanently-failing promise.
    return request.finally(() => {
      this.__inflight = undefined;
    });
  }

  /** Build an `OAUTH_IDTOKEN_INVALID` error — always fatal. */
  private __reject(
    detail: string,
    meta: Record<string, unknown>,
    cause?: Error,
  ): PactOAuthError {
    return new PactOAuthError(
      `Provider '${this.__provider}' id_token rejected — ${detail}`,
      { code: 'OAUTH_IDTOKEN_INVALID', provider: this.__provider, ...meta },
      cause,
    );
  }

  /**
   * Validate the standard OIDC claims. Runs whether or not the signature
   * was checked — these are offline checks and cost nothing.
   *
   * crypt re-checks `iss`/`aud`/`exp`/`nbf` inside `verifyJWT`, but only
   * for tokens that reached a key, and RFC 7519 leaves it free to ignore
   * a *missing* `exp` entirely. So this stays the authority: it is what
   * the degraded path relies on, and it covers the three things crypt
   * does not — a mandatory `exp`, OIDC's `azp`, and the `nonce` replay
   * guard.
   *
   * @throws {@link PactOAuthError} (`OAUTH_IDTOKEN_INVALID`) on mismatch.
   */
  private __validateClaims(
    payload: Record<string, unknown>,
    context: IdTokenContext,
  ): void {
    const fail = (
      detail: string,
      meta: Record<string, unknown> = {},
    ): never => {
      throw this.__reject(detail, meta);
    };

    if (
      context.issuer !== undefined &&
      payload.iss !== context.issuer
    ) {
      fail(
        `issuer mismatch (expected '${context.issuer}', got '${
          String(payload.iss)
        }')`,
        { expectedIssuer: context.issuer, issuer: payload.iss },
      );
    }

    const audiences = Array.isArray(payload.aud)
      ? payload.aud
      : payload.aud === undefined
      ? []
      : [payload.aud];
    if (!audiences.includes(context.audience)) {
      fail(
        `audience mismatch (expected '${context.audience}', got '${
          String(payload.aud)
        }')`,
        { expectedAudience: context.audience, audience: payload.aud },
      );
    }
    // OIDC Core §3.1.3.7: with multiple audiences the authorized party MUST
    // be present and MUST be us.
    if (audiences.length > 1) {
      if (payload.azp === undefined) {
        fail('multi-audience id_token is missing the azp claim', {
          audience: payload.aud,
        });
      } else if (payload.azp !== context.audience) {
        fail(
          `authorized party mismatch (azp '${String(payload.azp)}')`,
          { azp: payload.azp },
        );
      }
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number') {
      fail('missing or non-numeric exp claim', { exp: payload.exp });
    }
    if (now > (payload.exp as number) + CLOCK_TOLERANCE_SECONDS) {
      fail('token has expired', { exp: payload.exp, now });
    }
    if (
      typeof payload.nbf === 'number' &&
      now < payload.nbf - CLOCK_TOLERANCE_SECONDS
    ) {
      fail('token is not yet valid (nbf)', { nbf: payload.nbf, now });
    }

    // Fail-closed once the caller opts in, mirroring `expectedState`: a
    // provider that drops the nonce cannot silently disable the replay
    // guard.
    if (context.nonce !== undefined && payload.nonce !== context.nonce) {
      fail('nonce mismatch', { nonce: payload.nonce });
    }
  }
}

// ── module helpers ──────────────────────────────────────────────────

/** Type guard for the asymmetric allow-list. */
const isAllowed = (alg: string): alg is IdTokenAlgorithm =>
  (ALLOWED_ALGORITHMS as readonly string[]).includes(alg);

/**
 * Pick the signing key for `kid`. With no `kid` in the token, only an
 * unambiguous key set (exactly one signing key) resolves — guessing among
 * several would let an attacker steer verification to a weaker key.
 */
function selectKey(
  keys: RemoteJWK[],
  kid: string | undefined,
): RemoteJWK | undefined {
  const usable = keys.filter((k) => k.use === undefined || k.use === 'sig');
  if (kid !== undefined) return usable.find((k) => k.kid === kid);
  return usable.length === 1 ? usable[0] : undefined;
}
