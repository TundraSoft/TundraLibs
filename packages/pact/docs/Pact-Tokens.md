# Tokens

PACT's token layer: issue, verify, and refresh JWTs, and HMAC-sign arbitrary
request content - both delegated to [`@tundralibs/crypt`](../../crypt/README.md).
Keys and the signing algorithm are configured once at construction, and every
token operation reads that configuration.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Keys and algorithms](#keys-and-algorithms)
- [Issuing tokens](#issuing-tokens)
- [Verifying tokens](#verifying-tokens)
- [Refreshing tokens](#refreshing-tokens)
- [Decoding without verification](#decoding-without-verification)
- [Request signing (HMAC)](#request-signing-hmac)
- [Token events](#token-events)
- [Related](#related)

## Keys and algorithms

The algorithm family decides the shape of `secret`. The symmetric `HS*`
family takes a single shared secret **string** at least as long as the
hash output (RFC 7518 §3.2): **HS256 ≥ 32 bytes, HS384 ≥ 48 bytes,
HS512 ≥ 64 bytes** (measured in UTF-8 bytes). The asymmetric `RS*` family
takes a `{ privateKey, publicKey }` PEM pair - the private key signs, the
public key verifies.

```typescript
import { PACT } from '@tundralibs/pact';

// HS* (symmetric) - one shared secret string >= the hash size in bytes
// (RFC 7518 §3.2): HS256 >= 32, HS384 >= 48, HS512 >= 64
const hmac = new PACT({
  bits: { READ: 1n, EDIT: 2n },
  algorithm: 'HS256', // default; HS384 / HS512 also
  secret: 'a-256-bit-shared-secret-for-hs256!',
  keyId: 'k1', // optional: stamped as the `kid` header for rotation
});

// RS* (asymmetric) - a { privateKey, publicKey } PEM pair
const rsa = new PACT({
  bits: { READ: 1n, EDIT: 2n },
  algorithm: 'RS256', // RS384 / RS512 also
  secret: {
    privateKey: myPrivateKeyPem, // signs (issue / refresh)
    publicKey: myPublicKeyPem, // verifies
  },
});
```

The shape is validated against `algorithm` at construction: an `HS*`
algorithm with a key pair, an `RS*` algorithm with a string, or an `HS*`
secret shorter than that algorithm's minimum (HS256 32 / HS384 48 /
HS512 64 bytes) each throw `PactDefinitionError` (`INVALID_OPTION`).
Omit `secret` entirely for an authorization-only PACT - every token method
then throws `PactDefinitionError` (`MISSING_OPTION`). Defaults: `algorithm`
is `HS256`, `expiry` is 3600 seconds. `keyId` stamps a `kid` header on every
issued token for key-rotation schemes.

## Issuing tokens

`generateJWT(claims)` stamps `iat` (now) and `exp` (now + `expiry`), plus
`iss`/`aud` when those options are configured, then merges your `claims`
last - so a caller-supplied claim overrides the stamped one. It emits
`issue` and returns the signed compact JWT.

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  bits: { READ: 1n, EDIT: 2n },
  secret: 'a-256-bit-shared-secret-for-hs256!',
  issuer: 'api.example.com',
  audience: 'web',
  expiry: 900, // seconds
});

// iat/exp and iss/aud come from options; your claims win on conflict.
const token = await pact.generateJWT({ sub: 'user-1', role: 'editor' });
```

Throws `PactDefinitionError` (`MISSING_OPTION`) when no `secret` is configured.

### Embedding grants

Permission grants are a `{ module -> BigInt mask }` map, and BigInt is not
JSON-serializable, so pass grants through `serializeGrants` (each mask
becomes a decimal string) before embedding them in a payload - and
`deserializeGrants` after verifying. See
[Groups](./Pact-Groups.md) for `grantsForGroups` and
[Authorization](./Pact-Authorization.md) for the mask model.

```typescript
import { PACT, serializeGrants } from '@tundralibs/pact';

// grants is a { module -> BigInt mask } map (e.g. from grantsForGroups)
const grants = { Post: 3n }; // READ | EDIT

const token = await pact.generateJWT({
  sub: 'user-1',
  grants: serializeGrants(grants), // { Post: '3' }
});
```

## Verifying tokens

`verifyJWT(token)` checks the signature and standard claims with the
algorithm **pinned to the configured one** - verification never reads the
token header's `alg`, which closes the classic algorithm-confusion attack
(for example, an `RS*` verifier tricked into treating its public key as an
`HS*` secret). `iss` and `aud` are enforced when set.

After the cryptographic check passes, the `isRevoked` seam runs: returning
`true` vetoes the token and throws `PactTokenError` with code
`TOKEN_REVOKED`. This is how stateless JWTs stay revocable (a `jti`
blocklist, a key-rotation watermark) without PACT owning a store.

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  bits: { READ: 1n, EDIT: 2n },
  secret: 'a-256-bit-shared-secret-for-hs256!',
  issuer: 'api.example.com',
  isRevoked: (claims) => blocklist.has(String(claims.jti)),
});

try {
  const claims = await pact.verifyJWT(token);
  // signature + claims valid, and not revoked
} catch (err) {
  // crypt JWTError (bad signature / expired / iss / aud), or
  // PactTokenError with code 'TOKEN_REVOKED'
}
```

Emits `verify` on success; `verifyFailed` on any failure, plus `revoked`
when the veto is what failed it. Throws crypt's `JWTError`
(signature/claims) or `PactTokenError` (`TOKEN_REVOKED`).

## Refreshing tokens

`refreshJWT(token)` runs the full verify path first - signature, claims,
and the `isRevoked` seam - so **a revoked token cannot be refreshed** - then
re-issues the same claims with a fresh `exp = now + expiry`.

```typescript
import { PACT } from '@tundralibs/pact';

// Re-verifies the old token (including revocation), then re-issues
// with a fresh exp = now + expiry.
const fresh = await pact.refreshJWT(oldToken);
```

It emits `verify` (from that inner check) and then `refresh`; it does not
emit `issue`. Throws whatever `verifyJWT` throws (crypt `JWTError`, or
`PactTokenError` `TOKEN_REVOKED`).

## Decoding without verification

`decodeJWT(token)` base64url-decodes the token into `{ header, payload }`
**without verifying the signature or claims**. Use it for routing or a
`kid` lookup before verification, or for debugging - never trust its output
for authorization, where `verifyJWT` is the only safe path.

```typescript
import { PACT } from '@tundralibs/pact';

// No signature check - inspection only.
const { header, payload } = pact.decodeJWT(token);
console.log(header.kid, payload.sub);
```

Unlike the other token methods this one is synchronous (no `await`).

## Request signing (HMAC)

`sign(content, key?)` and `verify(content, signature, key?)` are HMAC over
arbitrary content (`string` or `Uint8Array`) - for bearer-token schemes,
webhook signatures, and signed URLs.

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  bits: { READ: 1n },
  secret: 'a-256-bit-shared-secret-for-hs256!',
});

const signature = await pact.sign(webhookBody);
const ok = await pact.verify(webhookBody, signature); // boolean
```

When you omit `key`, PACT signs with a key **derived from the configured
secret via HKDF** (RFC 5869) under the `info` label `'pact:request-sign'` -
not the raw secret. That domain separation means a request signature can
never be replayed as an `HS*` JWT signature (a JWT is HMAC'd with the raw
secret over `header.payload`), and vice versa. Pass an explicit `key` to
sign with your own material instead - **required** when PACT holds an RSA
key pair, since there is no shared secret to derive from.

`sign`/`verify` throw `PactDefinitionError` (`MISSING_OPTION`) when no `key`
is given and PACT has no shared `secret` (or holds an RSA key pair).

## Token events

Subscribe with an `_on<Event>` constructor option or `.on(event, handler)`
after construction. The token lifecycle emits five events:

| Event          | Handler signature           | Fires when                                                                     |
| -------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `issue`        | `(token, claims)`           | `generateJWT` issued a token                                                   |
| `verify`       | `(claims, token)`           | `verifyJWT` passed — and a successful `refreshJWT` (its inner verification)    |
| `verifyFailed` | `(error, token)`            | `verifyJWT` failed for any reason                                              |
| `revoked`      | `(claims, token)`           | the `isRevoked` seam vetoed a signature-valid token (alongside `verifyFailed`) |
| `refresh`      | `(token, previous, claims)` | `refreshJWT` re-issued a token                                                 |

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  bits: { READ: 1n },
  secret: 'a-256-bit-shared-secret-for-hs256!',
  _onissue: (token, claims) => audit('issued', claims.sub), // constructor form
});

pact.on('verify', (claims, token) => audit('verified', claims.sub));
pact.on('verifyFailed', (error, token) => audit('verifyFailed', error.message));
pact.on('revoked', (claims, token) => audit('revoked', claims.jti));
pact.on('refresh', (token, previous, claims) => audit('refreshed', claims.sub));
```

A successful refresh emits **two** events: `verify` (from its inner
re-verification) and then `refresh` - never `issue`.

The `verify` and `refresh` success events fire only after the outcome is
final, and their listeners are isolated — **both a synchronous throw and an
async listener's rejected promise are swallowed**: a misbehaving audit
listener can neither reject an already-verified token, fire `verifyFailed`,
nor escape as a process-terminating unhandled rejection. The failure-path
emits (`verifyFailed`, `revoked`) are isolated the same way, so a throwing
(or rejecting) listener there cannot replace the typed error the caller must
branch on (e.g. `TOKEN_REVOKED`). Isolation covers the emits PACT performs —
if you emit an event yourself with `emitSync`, it still awaits each listener
in turn and still rejects with a listener's rejection.

## Related

- [Authorization](./Pact-Authorization.md) - the BigInt bitmask model, grants, and permission checks
- [OAuth](./Pact-OAuth.md) - the login seam and built-in OAuth2/PKCE providers
- [API Keys](./Pact-ApiKeys.md) - minting and verifying self-contained API key pairs

---

[← Back to Pact](../README.md)
