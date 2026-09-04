/**
 * @fileoverview JWKS-backed `id_token` verification for the OAuth client.
 *
 * Providers with no userinfo endpoint (and any `OIDC` issuer whose
 * discovery document omits `userinfo_endpoint`) hand pact the user's
 * identity inside the `id_token` returned by the code→token exchange.
 * That exchange is a direct server-to-server TLS POST, so OIDC Core
 * §3.1.3.7 permits skipping signature validation — checking it against
 * the provider's published key set is defense-in-depth: it removes the
 * token endpoint's response body from the trusted computing base.
 *
 * Everything cryptographic belongs to crypt: `verifyJWT` accepts the
 * JWKS entry as a JWK, validates the key against the operation, binds
 * the primitive to the key's shape rather than the token's header,
 * checks the signature, and validates `iss`/`aud`/`exp`/`nbf`. This
 * module owns only what crypt has no view of: fetching and caching the
 * key set, selecting by `kid`, refreshing on rotation, the OIDC claims
 * RFC 7519 does not define (`azp`, `nonce`, mandatory `exp`), and the
 * availability policy.
 *
 * The verification ALGORITHM is taken from the JWKS entry, never from
 * the token header: a JWK-declared `alg` is pinned outright; otherwise
 * the asymmetric allow-list is pinned and crypt's key-shape binding
 * refuses anything the key cannot carry. `HS*` and `none` are never in
 * the pin — a JWKS key is public, so an HS token "signed" with public
 * key bytes is a forgery attempt by construction.
 *
 * @module
 */

import { decodeJWT, JWTError, verifyJWT } from '@tundralibs/crypt/JWT';
import { PactError } from '../errors/mod.ts';

/** `fetch` supplier — late-bound so the client's test seam stays live. */
type FetchRef = () => typeof globalThis.fetch;

/** Construction options for {@link IdTokenVerifier}. */
export type IdTokenVerifierOptions = {
  /** @default 'PREFERRED' */
  policy?: 'PREFERRED' | 'REQUIRED';
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
 * Asymmetric JWS algorithms this verifier will pin. Deliberately
 * excludes `HS*` (symmetric — never valid against a published key) and
 * `none`.
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

/** Seconds of clock skew tolerated on `exp`/`nbf`. */
const CLOCK_TOLERANCE_SECONDS = 60;

/** Default JWKS cache lifetime — one hour. */
const DEFAULT_JWKS_TTL_MS = 3_600_000;

/** Floor between forced (unknown-`kid`) JWKS refreshes — without it a
 * flood of bogus `kid`s would make pact an amplifier against the
 * provider's key endpoint. */
const JWKS_MIN_REFRESH_MS = 30_000;

/** Hard timeout on a single JWKS fetch — a stalling host must not hang
 * the login. */
const JWKS_FETCH_TIMEOUT_MS = 10_000;

/** Reject a JWKS response whose declared size exceeds this (256 KiB). */
const MAX_JWKS_BYTES = 262_144;

/** Cap the number of keys read from a JWKS document. */
const MAX_JWKS_KEYS = 50;

/** One key from a provider's JWKS document — only the fields THIS module
 * reads; the key material itself goes to crypt untouched. */
type RemoteJWK = {
  kid?: unknown;
  alg?: unknown;
  use?: unknown;
};

/** The decoded header of an `id_token` (`typ` may be absent). */
type IdTokenHeader = { alg?: unknown; kid?: unknown };

/**
 * Verifies `id_token`s against a provider's JWKS, with a TTL cache and
 * rotation-aware refresh. One instance per OAuth client.
 */
export class IdTokenVerifier {
  private readonly __provider: string;
  private readonly __fetchRef: FetchRef;
  private readonly __policy: 'PREFERRED' | 'REQUIRED';
  private readonly __ttl: number;
  private readonly __onDegraded?: (reason: string) => void;
  /** Single-slot JWKS cache — one client verifies against one key set. */
  private __cache?: { uri: string; keys: RemoteJWK[]; fetchedAt: number };
  /** In-flight fetch, so concurrent logins share one request. */
  private __inflight?: Promise<RemoteJWK[]>;
  /** When the last forced (unknown-`kid`) refresh ran. */
  private __lastForcedRefresh = 0;

  /**
   * Create a verifier bound to one provider instance. Under the default
   * `'PREFERRED'` policy an unreachable key set degrades to decode-only
   * (claims still validated, `onDegraded` notified); `'REQUIRED'` makes
   * that case fatal.
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
   * JWKS, validate the standard claims, and return the payload. Claim
   * validation runs on BOTH paths — a token that skipped signature
   * verification because the key set was unreachable is still checked
   * for `iss`/`aud`/`exp`/`nbf`/`nonce`.
   *
   * @throws {PactError} `OAUTH_PROFILE_FAILED` when there is no
   *   id_token or it cannot be decoded; `OAUTH_IDTOKEN_INVALID` on a
   *   bad signature, unusable key, disallowed `alg`, or failed claim —
   *   always fatal, under either policy; `OAUTH_JWKS_UNAVAILABLE` when
   *   the key set is unobtainable under `'REQUIRED'`.
   */
  async verify(
    idToken: string | undefined,
    context: IdTokenContext,
  ): Promise<Record<string, unknown>> {
    if (idToken === undefined) {
      throw new PactError('OAUTH_PROFILE_FAILED', {
        provider: this.__provider,
        reason: 'provider returned no id_token to derive the profile from',
      });
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
      throw new PactError('OAUTH_PROFILE_FAILED', {
        provider: this.__provider,
        reason: 'id_token could not be decoded',
      }, cause as Error);
    }

    await this.__verifySignature(idToken, header, context);
    this.__validateClaims(payload, context);
    return payload;
  }

  // ── internals ─────────────────────────────────────────────────────

  /**
   * Verify the token's signature against the resolved JWKS key,
   * delegating the cryptography to crypt's `verifyJWT`. Resolves
   * quietly (after notifying) when the key set is unavailable under
   * `'PREFERRED'`; throws on every failure crypt reports, regardless of
   * policy.
   */
  private async __verifySignature(
    idToken: string,
    header: IdTokenHeader,
    context: IdTokenContext,
  ): Promise<void> {
    if (context.jwksUri === undefined) {
      return this.__degrade('provider publishes no JWKS endpoint');
    }
    // A plaintext key endpoint would let a network attacker swap the
    // trust anchor wholesale.
    if (!context.jwksUri.startsWith('https://')) {
      return this.__degrade(`JWKS endpoint is not https (${context.jwksUri})`);
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
      // Indistinguishable from a mid-rotation token, so classified as
      // unavailability rather than forgery — a made-up `kid` still
      // cannot produce a valid signature under any key we hold.
      return this.__degrade(
        kid === undefined
          ? 'id_token carries no kid and the JWKS holds no single usable key'
          : `no JWKS key matches kid '${kid}'`,
      );
    }

    // SECURITY: the algorithm comes from the key, not the token. A JWKS
    // entry naming an algorithm outside the asymmetric allow-list is
    // refused here rather than pinned.
    const keyAlgorithm = typeof jwk.alg === 'string' ? jwk.alg : undefined;
    if (keyAlgorithm !== undefined && !isAllowed(keyAlgorithm)) {
      throw this.__reject(
        `JWKS key declares unsupported alg '${keyAlgorithm}'`,
        { keyAlgorithm },
      );
    }

    try {
      await verifyJWT(idToken, jwk as unknown as JsonWebKey, {
        // Pin the key's own `alg` when it declares one; otherwise pin
        // the allow-list and let crypt's key-shape binding refuse any
        // algorithm this key cannot carry.
        algorithm: keyAlgorithm ?? [...ALLOWED_ALGORITHMS],
        ...(context.issuer !== undefined ? { iss: context.issuer } : {}),
        aud: context.audience,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
    } catch (cause) {
      // SECURITY: every failure crypt reports here is fatal under BOTH
      // policies — the key set was obtained, so nothing past this point
      // is an availability problem. Degradation is decided above,
      // before any key is resolved.
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
      throw new PactError('OAUTH_JWKS_UNAVAILABLE', {
        provider: this.__provider,
        reason,
      }, cause);
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
      // Rotation: the cache is valid by the clock but predates this
      // key. Refetch once, rate-limited, then accept the answer.
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
      // Bound the fetch: a stalling host must not hang login forever,
      // and an unbounded body must not OOM.
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
      const keys = (doc.keys as RemoteJWK[]).slice(0, MAX_JWKS_KEYS);
      this.__cache = { uri, keys, fetchedAt: Date.now() };
      return keys;
    })();
    this.__inflight = request;
    // Clear the slot however it settles; a rejection must not be cached
    // as a permanently-failing promise.
    return request.finally(() => {
      this.__inflight = undefined;
    });
  }

  /** Build an `OAUTH_IDTOKEN_INVALID` error — always fatal. */
  private __reject(
    reason: string,
    meta: Record<string, unknown>,
    cause?: Error,
  ): PactError {
    return new PactError('OAUTH_IDTOKEN_INVALID', {
      provider: this.__provider,
      reason,
      ...meta,
    }, cause);
  }

  /**
   * Validate the standard OIDC claims. Runs whether or not the
   * signature was checked — offline checks cost nothing, and this is
   * what the degraded path relies on. Covers the three things crypt
   * does not: a MANDATORY `exp`, OIDC's `azp`, and the `nonce` replay
   * guard.
   */
  private __validateClaims(
    payload: Record<string, unknown>,
    context: IdTokenContext,
  ): void {
    const fail = (
      reason: string,
      meta: Record<string, unknown> = {},
    ): never => {
      throw this.__reject(reason, meta);
    };

    if (context.issuer !== undefined && payload.iss !== context.issuer) {
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
    // OIDC Core §3.1.3.7: with multiple audiences the authorized party
    // MUST be present and MUST be us.
    if (audiences.length > 1) {
      if (payload.azp === undefined) {
        fail('multi-audience id_token is missing the azp claim', {
          audience: payload.aud,
        });
      } else if (payload.azp !== context.audience) {
        fail(`authorized party mismatch (azp '${String(payload.azp)}')`, {
          azp: payload.azp,
        });
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
 * unambiguous key set (exactly one signing key) resolves — guessing
 * among several would let an attacker steer verification to a weaker
 * key.
 */
function selectKey(
  keys: RemoteJWK[],
  kid: string | undefined,
): RemoteJWK | undefined {
  const usable = keys.filter((k) => k.use === undefined || k.use === 'sig');
  if (kid !== undefined) return usable.find((k) => k.kid === kid);
  return usable.length === 1 ? usable[0] : undefined;
}
