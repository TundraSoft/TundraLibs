import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { IdTokenVerifier } from './IdTokenVerifier.ts';
import { PactOAuthError } from '../errors/mod.ts';

// ── signing fixtures ────────────────────────────────────────────────
//
// Keys are generated in-process (no network, no checked-in key material) and
// memoized so the whole file pays for at most one RSA + one EC keygen per
// algorithm. Tokens are hand-rolled rather than minted with crypt's
// `issueJWT`, because a real `id_token` header is `{ kid, alg }` with **no**
// `typ` (Apple) — the exact shape the verifier has to cope with.

const ENC = new TextEncoder();

const b64u = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(
    /=+$/,
    '',
  );
};
const b64uJSON = (value: unknown): string =>
  b64u(ENC.encode(JSON.stringify(value)));

type Alg = 'RS256' | 'PS256' | 'ES256' | 'ES384';

/** The curve RFC 7518 §3.4 binds to each `ES*` algorithm. */
const EC_CURVE: Record<string, string> = { ES256: 'P-256', ES384: 'P-384' };

/** The hash RFC 7518 §3.4 pairs with each `ES*` algorithm. */
const EC_HASH: Record<string, string> = {
  ES256: 'SHA-256',
  ES384: 'SHA-384',
};

const genParams = (alg: Alg): AlgorithmIdentifier =>
  (alg.startsWith('ES') ? { name: 'ECDSA', namedCurve: EC_CURVE[alg] } : {
    name: alg === 'PS256' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }) as unknown as AlgorithmIdentifier;

const signParams = (alg: Alg): AlgorithmIdentifier =>
  (alg.startsWith('ES')
    ? { name: 'ECDSA', hash: EC_HASH[alg] }
    : alg === 'PS256'
    ? { name: 'RSA-PSS', saltLength: 32 }
    : { name: 'RSASSA-PKCS1-v1_5' }) as unknown as AlgorithmIdentifier;

/** A generated key pair plus its public JWK. */
type Signer = { pair: CryptoKeyPair; jwk: Record<string, unknown> };

const signers = new Map<string, Promise<Signer>>();
function signer(alg: Alg, label = 'a'): Promise<Signer> {
  const cacheKey = `${alg}:${label}`;
  let existing = signers.get(cacheKey);
  if (existing === undefined) {
    existing = (async () => {
      const pair = await crypto.subtle.generateKey(
        genParams(alg),
        true,
        ['sign', 'verify'],
      ) as CryptoKeyPair;
      const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey) as
        & JsonWebKey
        & Record<string, unknown>;
      return { pair, jwk: jwk as Record<string, unknown> };
    })();
    signers.set(cacheKey, existing);
  }
  return existing;
}

const NOW = () => Math.floor(Date.now() / 1000);

/** Baseline claims for a well-formed Apple-style id_token. */
const claims = (extra: Record<string, unknown> = {}) => ({
  iss: 'https://appleid.apple.com',
  aud: 'client-id',
  sub: 'apple-user-1',
  iat: NOW(),
  exp: NOW() + 600,
  ...extra,
});

/** Mint a signed compact JWS. `header` overrides win. */
async function mint(
  alg: Alg,
  payload: Record<string, unknown>,
  options: { kid?: string; label?: string; header?: Record<string, unknown> } =
    {},
): Promise<string> {
  const { pair } = await signer(alg, options.label);
  // NOTE: no `typ` — this is what Apple actually sends.
  const header = { kid: options.kid ?? 'key-1', alg, ...options.header };
  const input = `${b64uJSON(header)}.${b64uJSON(payload)}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      signParams(alg),
      pair.privateKey,
      ENC.encode(input),
    ),
  );
  return `${input}.${b64u(sig)}`;
}

/** A JWKS document exposing the given signers. */
async function jwks(
  entries: Array<
    { alg: Alg; kid: string; label?: string; declareAlg?: boolean }
  >,
): Promise<{ keys: Array<Record<string, unknown>> }> {
  const keys: Array<Record<string, unknown>> = [];
  for (const entry of entries) {
    const { jwk } = await signer(entry.alg, entry.label);
    const { d: _d, p: _p, q: _q, ...pub } = jwk;
    keys.push({
      ...pub,
      kid: entry.kid,
      use: 'sig',
      ...(entry.declareAlg === false ? {} : { alg: entry.alg }),
    });
  }
  return { keys };
}

/** Recording fetch stub serving one JWKS URL. */
function jwksFetch(
  responder: (call: number) => Response | Promise<Response>,
): { fn: typeof globalThis.fetch; calls: () => number } {
  let calls = 0;
  const fn = ((url: unknown) => {
    if (!String(url).includes('/keys')) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    calls += 1;
    return Promise.resolve(responder(calls));
  }) as unknown as typeof globalThis.fetch;
  return { fn, calls: () => calls };
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const JWKS_URI = 'https://appleid.apple.com/auth/keys';
const CONTEXT = {
  jwksUri: JWKS_URI,
  issuer: 'https://appleid.apple.com',
  audience: 'client-id',
};

describe('pact.IdTokenVerifier signature', () => {
  it('accepts a correctly signed id_token (Apple-style, no typ header)', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);
    const payload = await verifier.verify(
      await mint('RS256', claims()),
      CONTEXT,
    );
    asserts.assertEquals(payload.sub, 'apple-user-1');
  });

  it('accepts ES256 (elliptic-curve issuers)', async () => {
    const doc = await jwks([{ alg: 'ES256', kid: 'ec-1' }]);
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('idp', () => fn);
    const payload = await verifier.verify(
      await mint('ES256', claims(), { kid: 'ec-1' }),
      CONTEXT,
    );
    asserts.assertEquals(payload.sub, 'apple-user-1');
  });

  it('accepts ES384 on a P-384 JWKS key (delegated ECDSA)', async () => {
    // ES384/P-384 exercises the delegation on an algorithm-and-curve pairing
    // no other test covers, and one crypt itself only gained with ECDSA
    // support — the whole reason this module verified in-house before.
    const doc = await jwks([{ alg: 'ES384', kid: 'ec-384' }]);
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('idp', () => fn);
    const payload = await verifier.verify(
      await mint('ES384', claims(), { kid: 'ec-384' }),
      CONTEXT,
    );
    asserts.assertEquals(payload.sub, 'apple-user-1');
  });

  it('rejects an ES256 header over a P-384 JWKS key (curve binding)', async () => {
    // RFC 7518 §3.4 binds ES256 to P-256 and nothing else. The JWKS entry
    // declares no `alg`, so the pin is the allow-list and the curve binding
    // inside crypt is the only thing standing between a P-384 key and a token
    // asking to be verified as ES256.
    const { jwk } = await signer('ES384');
    const { d: _d, alg: _alg, ...pub } = jwk;
    const doc = { keys: [{ ...pub, kid: 'ec-384', use: 'sig' }] };
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('idp', () => fn);
    // A genuine P-384 signature, mislabelled ES256 in the header.
    const token = await mint('ES384', claims(), {
      kid: 'ec-384',
      header: { alg: 'ES256' },
    });
    const err = await asserts.assertRejects(
      () => verifier.verify(token, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
    asserts.assertEquals(err.context.jwtCode, 'UNSUPPORTED_ALGORITHM');
  });

  it('rejects a TAMPERED payload (signature no longer covers the claims)', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);
    const token = await mint('RS256', claims());
    // Swap the subject — privilege escalation to another user's account.
    const [header, , signature] = token.split('.');
    const forged = `${header}.${
      b64uJSON(claims({ sub: 'victim-account' }))
    }.${signature}`;

    const err = await asserts.assertRejects(
      () => verifier.verify(forged, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('rejects a token signed by an ATTACKER key with a legitimate kid', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);
    // Attacker owns 'evil' key material but claims the provider's kid.
    const forged = await mint('RS256', claims(), {
      kid: 'key-1',
      label: 'evil',
    });

    const err = await asserts.assertRejects(
      () => verifier.verify(forged, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('rejects ALGORITHM CONFUSION: HS256 forged with the public key bytes', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);
    // The classic attack: treat the (public, attacker-known) modulus as an
    // HMAC secret and sign HS256. A verifier that trusted the header's alg
    // would accept this.
    const header = b64uJSON({ kid: 'key-1', alg: 'HS256' });
    const body = b64uJSON(claims({ sub: 'attacker' }));
    const secret = await crypto.subtle.importKey(
      'raw',
      ENC.encode(String(doc.keys[0]!.n)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = new Uint8Array(
      await crypto.subtle.sign('HMAC', secret, ENC.encode(`${header}.${body}`)),
    );
    const err = await asserts.assertRejects(
      () => verifier.verify(`${header}.${body}.${b64u(mac)}`, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('rejects an alg the JWKS key does not declare (PS256 over an RS256 key)', async () => {
    // Same RSA key material verifies both RS256 and PS256, so this only
    // fails if the algorithm is taken from the JWKS entry rather than the
    // token header.
    const rs = await signer('RS256');
    const { d: _d, p: _p, q: _q, ...pub } = rs.jwk;
    const doc = { keys: [{ ...pub, kid: 'key-1', use: 'sig', alg: 'RS256' }] };
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);

    // Re-import the very same key for PSS signing and produce a genuine
    // PS256 signature — cryptographically valid, just not the algorithm the
    // JWKS authorises for this key.
    const privateJwk = await crypto.subtle.exportKey(
      'jwk',
      rs.pair.privateKey,
    ) as JsonWebKey;
    const pss = await crypto.subtle.importKey(
      'jwk',
      { ...privateJwk, alg: undefined, key_ops: undefined } as JsonWebKey,
      { name: 'RSA-PSS', hash: 'SHA-256' } as unknown as AlgorithmIdentifier,
      false,
      ['sign'],
    );
    const header = b64uJSON({ kid: 'key-1', alg: 'PS256' });
    const body = b64uJSON(claims());
    const sig = new Uint8Array(
      await crypto.subtle.sign(
        { name: 'RSA-PSS', saltLength: 32 } as unknown as AlgorithmIdentifier,
        pss,
        ENC.encode(`${header}.${body}`),
      ),
    );
    const err = await asserts.assertRejects(
      () => verifier.verify(`${header}.${body}.${b64u(sig)}`, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
    asserts.assertEquals(err.context.keyAlgorithm, 'RS256');
  });

  it('rejects an EC/RSA key-type mismatch when the JWKS omits alg', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1', declareAlg: false }]);
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);
    // Header asks for ES256; the key is RSA.
    const token = await mint('RS256', claims(), {
      header: { alg: 'ES256' },
    });
    const err = await asserts.assertRejects(
      () => verifier.verify(token, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('accepts a header-chosen alg when the JWKS omits alg (kty-compatible)', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1', declareAlg: false }]);
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);
    const payload = await verifier.verify(
      await mint('RS256', claims()),
      CONTEXT,
    );
    asserts.assertEquals(payload.sub, 'apple-user-1');
  });
});

describe('pact.IdTokenVerifier claims', () => {
  const okFetch = async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    return jwksFetch(() => jsonResponse(doc)).fn;
  };

  it('rejects an issuer mismatch', async () => {
    const fn = await okFetch();
    const verifier = new IdTokenVerifier('apple', () => fn);
    const token = await mint('RS256', claims({ iss: 'https://evil.example' }));
    const err = await asserts.assertRejects(
      () => verifier.verify(token, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('rejects an audience mismatch (token minted for another client)', async () => {
    const fn = await okFetch();
    const verifier = new IdTokenVerifier('apple', () => fn);
    const token = await mint('RS256', claims({ aud: 'someone-elses-client' }));
    const err = await asserts.assertRejects(
      () => verifier.verify(token, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('accepts an aud array containing the client id', async () => {
    const fn = await okFetch();
    const verifier = new IdTokenVerifier('apple', () => fn);
    const payload = await verifier.verify(
      await mint('RS256', claims({ aud: ['other', 'client-id'] })),
      CONTEXT,
    );
    asserts.assertEquals(payload.sub, 'apple-user-1');
  });

  it('rejects a multi-audience token whose azp is someone else', async () => {
    const fn = await okFetch();
    const verifier = new IdTokenVerifier('apple', () => fn);
    const token = await mint(
      'RS256',
      claims({ aud: ['other', 'client-id'], azp: 'other' }),
    );
    const err = await asserts.assertRejects(
      () => verifier.verify(token, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('rejects an expired token and one with no exp at all', async () => {
    const fn = await okFetch();
    const verifier = new IdTokenVerifier('apple', () => fn);
    const staleToken = await mint('RS256', claims({ exp: NOW() - 3600 }));
    const expired = await asserts.assertRejects(
      () => verifier.verify(staleToken, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(expired.code, 'OAUTH_IDTOKEN_INVALID');

    const noExpToken = await mint('RS256', {
      iss: CONTEXT.issuer,
      aud: 'client-id',
    });
    const noExp = await asserts.assertRejects(
      () => verifier.verify(noExpToken, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(noExp.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('rejects a not-yet-valid token (nbf)', async () => {
    const fn = await okFetch();
    const verifier = new IdTokenVerifier('apple', () => fn);
    const token = await mint('RS256', claims({ nbf: NOW() + 3600 }));
    const err = await asserts.assertRejects(
      () => verifier.verify(token, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('enforces nonce fail-closed once expectedNonce is supplied', async () => {
    const fn = await okFetch();
    const verifier = new IdTokenVerifier('apple', () => fn);
    const withNonce = { ...CONTEXT, nonce: 'n-123' };

    // matching nonce → accepted
    const ok = await verifier.verify(
      await mint('RS256', claims({ nonce: 'n-123' })),
      withNonce,
    );
    asserts.assertEquals(ok.sub, 'apple-user-1');

    // wrong nonce → rejected
    const wrongToken = await mint('RS256', claims({ nonce: 'other' }));
    const wrong = await asserts.assertRejects(
      () => verifier.verify(wrongToken, withNonce),
      PactOAuthError,
    );
    asserts.assertEquals(wrong.code, 'OAUTH_IDTOKEN_INVALID');

    // dropping the claim entirely must NOT disable the check
    const noNonceToken = await mint('RS256', claims());
    const dropped = await asserts.assertRejects(
      () => verifier.verify(noNonceToken, withNonce),
      PactOAuthError,
    );
    asserts.assertEquals(dropped.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('surfaces a malformed id_token / a missing one as OAUTH_PROFILE_FAILED', async () => {
    const fn = await okFetch();
    const verifier = new IdTokenVerifier('apple', () => fn);
    const missing = await asserts.assertRejects(
      () => verifier.verify(undefined, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(missing.code, 'OAUTH_PROFILE_FAILED');

    const garbage = await asserts.assertRejects(
      () => verifier.verify('not-a-jwt', CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(garbage.code, 'OAUTH_PROFILE_FAILED');
    asserts.assert(garbage.cause !== undefined, 'decode failure chains cause');
  });
});

describe('pact.IdTokenVerifier caching and rotation', () => {
  it('caches the JWKS — repeat verifications do not refetch', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    const { fn, calls } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);
    for (let i = 0; i < 3; i++) {
      await verifier.verify(await mint('RS256', claims()), CONTEXT);
    }
    asserts.assertEquals(calls(), 1);
  });

  it('coalesces concurrent verifications onto a single fetch', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    const { fn, calls } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);
    const token = await mint('RS256', claims());
    await Promise.all([
      verifier.verify(token, CONTEXT),
      verifier.verify(token, CONTEXT),
      verifier.verify(token, CONTEXT),
    ]);
    asserts.assertEquals(calls(), 1);
  });

  it('refetches on an unknown kid and succeeds after rotation', async () => {
    const before = await jwks([{ alg: 'RS256', kid: 'old' }]);
    const after = await jwks([
      { alg: 'RS256', kid: 'old' },
      { alg: 'RS256', kid: 'new', label: 'rotated' },
    ]);
    const { fn, calls } = jwksFetch((call) =>
      jsonResponse(call === 1 ? before : after)
    );
    const verifier = new IdTokenVerifier('apple', () => fn);

    // Warm the cache with the pre-rotation document.
    await verifier.verify(
      await mint('RS256', claims(), { kid: 'old' }),
      CONTEXT,
    );
    asserts.assertEquals(calls(), 1);

    // A token signed by the freshly rotated key forces exactly one refresh.
    const payload = await verifier.verify(
      await mint('RS256', claims(), { kid: 'new', label: 'rotated' }),
      CONTEXT,
    );
    asserts.assertEquals(payload.sub, 'apple-user-1');
    asserts.assertEquals(calls(), 2);
  });

  it('rate-limits forced refreshes so bogus kids cannot amplify', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    const { fn, calls } = jwksFetch(() => jsonResponse(doc));
    const verifier = new IdTokenVerifier('apple', () => fn);
    await verifier.verify(await mint('RS256', claims()), CONTEXT);
    asserts.assertEquals(calls(), 1);

    // Five tokens with made-up kids: the first triggers one refresh, the
    // rest are absorbed by the cooldown.
    for (let i = 0; i < 5; i++) {
      await verifier.verify(
        await mint('RS256', claims(), { kid: `bogus-${i}` }),
        CONTEXT,
      );
    }
    asserts.assertEquals(calls(), 2);
  });
});

describe('pact.IdTokenVerifier availability policy', () => {
  const unreachable = jwksFetch(() =>
    Promise.reject(new Error('network down'))
  );

  it("'preferred' (default) degrades to claim-validated decoding", async () => {
    const reasons: string[] = [];
    const verifier = new IdTokenVerifier('apple', () => unreachable.fn, {
      onDegraded: (reason) => reasons.push(reason),
    });
    const payload = await verifier.verify(
      await mint('RS256', claims()),
      CONTEXT,
    );
    asserts.assertEquals(payload.sub, 'apple-user-1');
    asserts.assertEquals(reasons.length, 1);
    asserts.assert(reasons[0]!.includes('JWKS fetch failed'));
  });

  it("'required' hard-fails with OAUTH_JWKS_UNAVAILABLE", async () => {
    const verifier = new IdTokenVerifier('apple', () => unreachable.fn, {
      policy: 'REQUIRED',
    });
    const token = await mint('RS256', claims());
    const err = await asserts.assertRejects(
      () => verifier.verify(token, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_JWKS_UNAVAILABLE');
  });

  it('still validates claims on the degraded path (fallback is not blind trust)', async () => {
    const verifier = new IdTokenVerifier('apple', () => unreachable.fn);
    // JWKS unreachable AND the token is for another client — the claim
    // check is signature-independent, so this must still fail.
    const token = await mint('RS256', claims({ aud: 'someone-else' }));
    const err = await asserts.assertRejects(
      () => verifier.verify(token, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_IDTOKEN_INVALID');
  });

  it('treats a non-2xx and a malformed JWKS as unavailability', async () => {
    for (
      const respond of [
        () => jsonResponse({ error: 'nope' }, 503),
        () => jsonResponse({ notKeys: [] }),
      ]
    ) {
      const { fn } = jwksFetch(respond);
      const strict = new IdTokenVerifier('apple', () => fn, {
        policy: 'REQUIRED',
      });
      const token = await mint('RS256', claims());
      const err = await asserts.assertRejects(
        () => strict.verify(token, CONTEXT),
        PactOAuthError,
      );
      asserts.assertEquals(err.code, 'OAUTH_JWKS_UNAVAILABLE');
    }
  });

  it('treats an unresolvable kid as unavailability, not forgery', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    const { fn } = jwksFetch(() => jsonResponse(doc));
    const strict = new IdTokenVerifier('apple', () => fn, {
      policy: 'REQUIRED',
    });
    const token = await mint('RS256', claims(), { kid: 'never-published' });
    const err = await asserts.assertRejects(
      () => strict.verify(token, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_JWKS_UNAVAILABLE');
    asserts.assert(String(err.context.reason).includes('never-published'));
  });

  it('refuses a non-https JWKS endpoint', async () => {
    const doc = await jwks([{ alg: 'RS256', kid: 'key-1' }]);
    const { fn, calls } = jwksFetch(() => jsonResponse(doc));
    const strict = new IdTokenVerifier('idp', () => fn, {
      policy: 'REQUIRED',
    });
    const token = await mint('RS256', claims());
    const err = await asserts.assertRejects(
      () =>
        strict.verify(token, {
          ...CONTEXT,
          jwksUri: 'http://idp.example.com/keys',
        }),
      PactOAuthError,
    );
    asserts.assertEquals(err.code, 'OAUTH_JWKS_UNAVAILABLE');
    asserts.assertEquals(calls(), 0, 'never fetched over plaintext');
  });

  it('a refused key and a forged signature are BOTH fatal under preferred', async () => {
    // The mapping that matters most. Once the key set is in hand, neither
    // crypt's INVALID_SECRET (a trust anchor it will not use) nor its
    // INVALID_SIGNATURE (a forgery) may take the 'preferred' fallback:
    // degrading either would silently convert an attack into a soft pass.
    // Only *availability* failures — decided before any key is resolved —
    // degrade.
    const rs = await signer('RS256');
    const { d: _d, p: _p, q: _q, ...pub } = rs.jwk;
    const reasons: string[] = [];

    // (a) The JWKS offers the key for signing, but its `key_ops` contradict
    // verification, so crypt refuses the material itself.
    const unusable = {
      keys: [{
        ...pub,
        kid: 'key-1',
        use: 'sig',
        alg: 'RS256',
        key_ops: ['encrypt'],
      }],
    };
    const keyFetch = jwksFetch(() => jsonResponse(unusable));
    const onKey = new IdTokenVerifier('apple', () => keyFetch.fn, {
      onDegraded: (reason) => reasons.push(reason),
    });
    const genuine = await mint('RS256', claims());
    const badKey = await asserts.assertRejects(
      () => onKey.verify(genuine, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(badKey.code, 'OAUTH_IDTOKEN_INVALID');
    asserts.assertEquals(badKey.context.jwtCode, 'INVALID_SECRET');
    asserts.assertEquals(reasons, [], 'a refused key never degrades');

    // (b) A forgery under that same default policy.
    const good = { keys: [{ ...pub, kid: 'key-1', use: 'sig', alg: 'RS256' }] };
    const sigFetch = jwksFetch(() => jsonResponse(good));
    const onSig = new IdTokenVerifier('apple', () => sigFetch.fn, {
      onDegraded: (reason) => reasons.push(reason),
    });
    const forged = await mint('RS256', claims(), { label: 'evil' });
    const badSig = await asserts.assertRejects(
      () => onSig.verify(forged, CONTEXT),
      PactOAuthError,
    );
    asserts.assertEquals(badSig.code, 'OAUTH_IDTOKEN_INVALID');
    asserts.assertEquals(badSig.context.jwtCode, 'INVALID_SIGNATURE');
    asserts.assertEquals(reasons, [], 'a forged signature never degrades');
  });

  it('degrades when the provider publishes no JWKS at all', async () => {
    const { fn } = jwksFetch(() => jsonResponse({ keys: [] }));
    const reasons: string[] = [];
    const verifier = new IdTokenVerifier('custom', () => fn, {
      onDegraded: (reason) => reasons.push(reason),
    });
    const payload = await verifier.verify(await mint('RS256', claims()), {
      issuer: CONTEXT.issuer,
      audience: CONTEXT.audience,
    });
    asserts.assertEquals(payload.sub, 'apple-user-1');
    asserts.assertEquals(reasons, ['provider publishes no JWKS endpoint']);
  });
});
