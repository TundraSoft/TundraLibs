# Crypt-JWT

JSON Web Token creation, verification, decoding, and refresh.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Overview

JWT implementation supporting HMAC, RSA and ECDSA signing algorithms.

### Features

| Feature              | Bun | Deno | Node.js | Workers | Browser |
| -------------------- | --- | ---- | ------- | ------- | ------- |
| HS256                | ✅  | ✅   | ✅      | ✅      | ✅      |
| HS512                | ✅  | ✅   | ✅      | ✅      | ✅      |
| RS256                | ✅  | ✅   | ✅      | ✅      | ✅      |
| RS512                | ✅  | ✅   | ✅      | ✅      | ✅      |
| PS256                | ✅  | ✅   | ✅      | ✅      | ✅      |
| ES256                | ✅  | ✅   | ✅      | ✅      | ✅      |
| ES384 / ES512        | ✅  | ✅   | ✅      | ✅      | ✅      |
| EdDSA (Ed25519)      | ✅  | ✅   | ✅      | ✅      | ✅      |
| Claims               | ✅  | ✅   | ✅      | ✅      | ✅      |
| RFC 9068 `at+jwt`    | ✅  | ✅   | ✅      | ✅      | ✅      |
| `CryptoKey` / JWK in | ✅  | ✅   | ✅      | ✅      | ✅      |

### Algorithms

| Family | Algorithms              | Key                                  |
| ------ | ----------------------- | ------------------------------------ |
| HMAC   | `HS256` `HS384` `HS512` | Shared secret                        |
| RSA    | `RS256` `RS384` `RS512` | RSA key pair (PKCS#1 v1.5)           |
| RSA    | `PS256` `PS384` `PS512` | RSA key pair (PSS)                   |
| ECDSA  | `ES256` `ES384` `ES512` | EC key pair on P-256 / P-384 / P-521 |
| EdDSA  | `EdDSA`                 | Ed25519 key pair (RFC 8037)          |

Each `ES*` algorithm is bound to exactly one curve (RFC 7518 §3.4). Note that
**`ES512` uses P-521**, not a nonexistent "P-512" — see
[ECDSA](#ecdsa-es256--es384--es512).

### Key input

`issueJWT` and `verifyJWT` accept three interchangeable key forms:

| Form         | Use                                                             |
| ------------ | --------------------------------------------------------------- |
| `string`     | PEM-armoured key, or a raw secret for `HS*`                     |
| `CryptoKey`  | An already-imported Web Crypto key, used as-is                  |
| `JsonWebKey` | A JWK, e.g. an entry straight out of a provider's JWKS document |

A supplied `CryptoKey` or JWK is validated against the operation rather than
trusted — see [Security notes](#security-notes). Supported and unsupported PEM
shapes are listed in [Crypt-Sign](../sign/Crypt-Sign.md#supported-key-formats).

## Installation

**Deno:**

```bash
deno add @tundralibs/crypt
```

**Bun:**

```bash
bunx jsr add @tundralibs/crypt
```

**Node.js:**

```bash
npx jsr add @tundralibs/crypt
```

## API Reference

### `issueJWT()`

Creates a signed JWT.

```typescript ignore
const issueJWT: <T extends JWTPayload = JWTPayload>(
  algo: JWTAlgorithm,
  payload: T,
  key: SigningKey,
  options?: string | JWTIssueOptions,
) => Promise<string>;
```

**Parameters:**

- `algo` — The signing algorithm (`'HS256'`, `'HS384'`, `'HS512'`, `'RS256'`, `'RS384'`, `'RS512'`, `'PS256'`, `'PS384'`, `'PS512'`, `'ES256'`, `'ES384'`, `'ES512'`, `'EdDSA'`)
- `payload` — The JWT payload object
- `key` — The signing key: an HMAC secret, or an asymmetric private key as a PEM string, `CryptoKey` or JWK (`SigningKey`)
- `options` — Optional header metadata. A bare string is treated as the Key ID (`kid`); pass a `JWTIssueOptions` object for `{ kid, typ }`.
  - `kid` — Key ID to include in the JWT header
  - `typ` — JOSE `typ` header (default `'JWT'`; use `'at+jwt'` for an RFC 9068 access token)

**Returns:** `Promise<string>` — The signed JWT token string

**Example:**

```typescript
import { issueJWT } from '@tundralibs/crypt/JWT';

declare const privateKeyPEM: string;

const token = await issueJWT(
  'HS256',
  { sub: 'user-123', role: 'admin' },
  'my-jwt-secret',
);

// RFC 9068 OAuth 2.0 access token
const accessToken = await issueJWT(
  'RS256',
  { sub: 'user-123', client_id: 'app-42' },
  privateKeyPEM,
  { typ: 'at+jwt', kid: 'key-2024-01' },
);
```

### `verifyJWT()`

Verifies and decodes a JWT.

```typescript ignore
const verifyJWT: <T extends JWTPayload = JWTPayload>(
  token: string,
  key: SigningKey,
  options?: JWTVerifyOptions,
) => Promise<T>;
```

**Parameters:**

- `token` — The JWT token string to verify
- `key` — The verification key: an HMAC secret, or an asymmetric public key as a PEM string, `CryptoKey` or JWK (`SigningKey`)
- `options` — Optional verification options (`JWTVerifyOptions`), including `algorithm` (pin the expected `alg`) and `typ` (accepted token types — see [Token types](#token-types-typ))

**Returns:** `Promise<T>` — The decoded and verified payload

**Example:**

```typescript
import { verifyJWT } from '@tundralibs/crypt/JWT';

declare const token: string;

const payload = await verifyJWT(token, 'my-jwt-secret');
console.log(payload.sub); // 'user-123'
```

#### Token types (`typ`)

**`verifyJWT` does not check `typ` unless you ask it to.** RFC 7519 §5.1 makes
the header OPTIONAL and states it "is ignored by JWT implementations; any
processing of this parameter is performed by the JWT application". Real tokens
depend on that: Apple's OIDC `id_token` header is just `{kid, alg}`, and
`secevent+jwt` (RFC 8417), `dpop+jwt` (RFC 9449) and OIDC's `logout+jwt` are all
legitimate types a general-purpose verifier has no business rejecting.

`JWT_DEFAULT_TYPES` is therefore a convenience starting set, not a default:

| `typ`    | Meaning                                |
| -------- | -------------------------------------- |
| `JWT`    | Plain JWT (RFC 7519 §5.1)              |
| `at+jwt` | OAuth 2.0 access token (RFC 9068 §2.1) |

`typ` carries a media type, so per RFC 7515 §4.1.9 comparison is
**case-insensitive** and the `application/` prefix **may be omitted** when the
remainder contains no `/`. `at+jwt`, `AT+JWT` and `application/at+jwt` are
therefore all the same type — on the token _and_ in your list.

Passing `typ` makes it **mandatory**: the header must carry one _and_ it must
match, so a token cannot evade your pin by omitting the header. That is what
stops **cross-type token confusion** — an OIDC `id_token`, a DPoP proof or a
security event token, signed with the same key by the same issuer, replayed at
an endpoint that expects an access token. (The primary defenses are `aud`/`iss`
and algorithm pinning; `typ` is supplementary, which is why it is opt-in.) Pin
`typ` per endpoint:

```typescript
import { JWT_DEFAULT_TYPES, verifyJWT } from '@tundralibs/crypt/JWT';

declare const token: string;
declare const publicKeyPEM: string;
declare const key: string;

// Resource server: access tokens only — a plain JWT or id_token is rejected
// with a JWTError (code INVALID_HEADER) even though its signature is valid.
const claims = await verifyJWT(token, publicKeyPEM, {
  algorithm: 'RS256',
  typ: 'at+jwt',
});

// Widen for a bespoke token type without dropping the defaults.
await verifyJWT(token, key, { typ: [...JWT_DEFAULT_TYPES, 'my+jwt'] });
```

An unrecognised `typ` throws a `JWTError` with code `INVALID_HEADER`.

### `decodeJWT()`

Decodes a JWT without verifying the signature.

```typescript ignore
const decodeJWT: (
  token: string,
) => { header: JWTHeader; payload: JWTPayload };
```

**Parameters:**

- `token` — The JWT token string to decode

**Returns:** Object with `header` and `payload` fields (unverified)

A malformed token always throws a typed `JWTError` (never a raw `TypeError`): a
header that is not a JSON object, or whose required `alg` is missing or not a
non-empty string, throws `JWTError` with code `INVALID_HEADER`. This holds for
unauthenticated input, so callers that read `header.alg` (such as `refreshJWT`)
can rely on the `instanceof JWTError` contract.

> **Warning:** `decodeJWT` does not verify the signature. Use `verifyJWT` for authenticated data.

**Example:**

```typescript
import { decodeJWT } from '@tundralibs/crypt/JWT';

declare const token: string;

const { header, payload } = decodeJWT(token);
console.log(header.alg); // 'HS256'
```

### `refreshJWT()`

Refreshes a JWT by verifying it and issuing a new one with extended expiration.

```typescript ignore
const refreshJWT: <T extends JWTPayload = JWTPayload>(
  token: string,
  keyOrKeys: string | RefreshKeyConfig,
  extendBy?: number,
  kid?: string,
) => Promise<string>;
```

**Parameters:**

- `token` — The JWT token to refresh
- `keyOrKeys` — For HMAC: a secret key string. For RSA: `{ verifyKey: string, signKey: string }`
- `extendBy` — Seconds to extend expiration (default: `3600`)
- `kid` — Optional Key ID for the new token (defaults to the original token's `kid`)

**Returns:** `Promise<string>` — A new JWT with extended expiration

The new token keeps the original's `alg` and `typ`, so refreshing an `at+jwt`
access token yields an `at+jwt` access token rather than downgrading it to a
plain `JWT`.

**Example:**

```typescript
import { refreshJWT } from '@tundralibs/crypt/JWT';

declare const oldToken: string;
declare const publicKeyPEM: string;
declare const privateKeyPEM: string;

// HMAC
const newToken = await refreshJWT(oldToken, 'my-secret', 7200); // 2 hours

// RSA
const newRsaToken = await refreshJWT(oldToken, {
  verifyKey: publicKeyPEM,
  signKey: privateKeyPEM,
});
```

## Errors

Every failure in `issueJWT`, `verifyJWT`, `decodeJWT`, and `refreshJWT` is a
`JWTError` carrying a stable code in `error.context.code` (there is no `.code`
getter — read it from `context`). Which code you catch also tells you whether
the signature had already verified: `EXPIRED_TOKEN` means an authentic token,
`INVALID_SIGNATURE` means an unauthenticated one.

All 12 codes, what triggers each, and the security-relevant distinctions
between them are documented in
[Crypt-JWT-Errors](errors/Crypt-JWT-Errors.md).

## Examples

### Basic JWT Flow

```typescript
import { issueJWT, verifyJWT } from '@tundralibs/crypt/JWT';

// Issue token
const token = await issueJWT('HS256', { sub: 'user-123' }, 'secret');

// Verify token
const payload = await verifyJWT(token, 'secret');
console.log(payload.sub); // 'user-123'
```

### With Expiration

```typescript
import { issueJWT, verifyJWT } from '@tundralibs/crypt/JWT';

const token = await issueJWT(
  'HS256',
  { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 86400 }, // 24h
  'secret',
);

try {
  const payload = await verifyJWT(token, 'secret');
  console.log('Valid:', payload);
} catch (error) {
  console.error('Token expired or invalid');
}
```

### RSA Signing

```typescript
import { issueJWT, verifyJWT } from '@tundralibs/crypt/JWT';

declare const privateKeyPEM: string;
declare const publicKeyPEM: string;

const token = await issueJWT('RS256', { sub: 'user-123' }, privateKeyPEM);
const payload = await verifyJWT(token, publicKeyPEM);
```

### Decode Without Verification

```typescript
import { decodeJWT } from '@tundralibs/crypt/JWT';

declare const token: string;

// Useful for inspecting algorithm before verification
const { header } = decodeJWT(token);
console.log(header.alg); // 'RS256'
```

### OAuth 2.0 Access Tokens (RFC 9068)

```typescript
import { issueJWT, verifyJWT } from '@tundralibs/crypt/JWT';

declare const privateKeyPEM: string;
declare const publicKeyPEM: string;

// Authorization server — mint an access token
const accessToken = await issueJWT(
  'RS256',
  {
    iss: 'https://auth.example.com',
    aud: 'https://api.example.com',
    sub: 'user-123',
    client_id: 'app-42',
    exp: Math.floor(Date.now() / 1000) + 300,
  },
  privateKeyPEM,
  { typ: 'at+jwt' },
);

// Resource server — accept access tokens only
const claims = await verifyJWT(accessToken, publicKeyPEM, {
  algorithm: 'RS256',
  typ: 'at+jwt',
  iss: 'https://auth.example.com',
  aud: 'https://api.example.com',
});
```

### ECDSA (`ES256` / `ES384` / `ES512`)

```typescript
import { issueJWT, verifyJWT } from '@tundralibs/crypt/JWT';
import { generateECKeyPair } from '@tundralibs/crypt/generators';

const keys = await generateECKeyPair({
  algorithm: 'ECDSA',
  curve: 'P-256', // ES256 is bound to P-256
  format: 'PEM',
});

const token = await issueJWT(
  'ES256',
  { sub: 'user-123' },
  keys.privateKeyExported as string,
);
const payload = await verifyJWT(token, keys.publicKeyExported as string, {
  algorithm: 'ES256',
});
```

Each `ES*` algorithm binds exactly one curve, and the pairing is enforced on
both issue and verify:

| Algorithm | Curve       | Hash    | Signature bytes |
| --------- | ----------- | ------- | --------------- |
| `ES256`   | `P-256`     | SHA-256 | 64              |
| `ES384`   | `P-384`     | SHA-384 | 96              |
| `ES512`   | **`P-521`** | SHA-512 | **132**         |

`ES512` uses **P-521**. The algorithm is named for its hash and the curve for
its field size, so the numbers do not line up; a P-521 signature is 132 bytes
because 521 bits rounds up to 66 bytes per half.

### Verifying an `id_token` with a JWK from a JWKS

```typescript
import { decodeJWT, verifyJWT } from '@tundralibs/crypt/JWT';

declare const idToken: string;
declare const jwksUri: string;
declare const clientId: string;

const { header } = decodeJWT(idToken);
const { keys } = await (await fetch(jwksUri)).json() as {
  keys: (JsonWebKey & { kid?: string })[];
};
const jwk = keys.find((k) => k.kid === header.kid)!;

// The JWK goes in directly — no PEM conversion. Pinning `algorithm` also
// pins the curve, so a key on any other curve is refused.
const claims = await verifyJWT(idToken, jwk, {
  algorithm: 'ES256',
  iss: 'https://accounts.example.com',
  aud: clientId,
});
```

Note that `typ` is not checked unless you pin it, which matters here: real
`id_token`s (Apple's, for one) carry no `typ` header at all.

## Security Notes

- Store tokens securely (httpOnly cookies recommended)
- Use appropriate expiration times
- Validate all claims
- Pin `options.algorithm` — the token's `alg` header is attacker-controlled
- Pin `options.typ` when an endpoint should honour exactly one token type, so a
  validly-signed token minted for another purpose can't be replayed there
- Use RSA or ECDSA for distributed systems
- Never store sensitive data in JWT payload

### Algorithm confusion

`verifyJWT` never lets the token's `alg` header choose the verification
primitive. Three layers stand in the way:

1. **Key-shape binding (always on).** The primitive comes from the shape of the
   key you supplied — read from the DER inside a PEM, a `CryptoKey`'s
   `algorithm`, or a JWK's `kty`/`crv`. An RSA key only ever verifies `RS*`/`PS*`,
   an EC key only `ES*`, a raw secret only `HS*`. So the classic forgery — an
   `HS256` token HMAC-keyed with the public key an attacker read from your JWKS
   — is rejected before any signature check runs.
2. **Curve binding (always on, `ES*` only).** An `ES256` token cannot be
   verified with a P-384 key. This fails as a _key_ error, not an invalid
   signature, so misconfiguration stays distinguishable from attack.
3. **Algorithm pinning (recommended).** Pass `options.algorithm`. Always pin in
   production.

### Caller-supplied keys are validated, not trusted

Accepting a `CryptoKey` or JWK widens the API, so the key's own metadata becomes
the security boundary. A key is refused when its family, curve, hash, type or
usages contradict the operation, or when a JWK's declared `alg`, `use` or
`key_ops` does (RFC 7517 §4.1–4.4). In particular a JWK carrying `d` — private
material — is refused for verification outright.

These are reported as `INVALID_SECRET`, deliberately separate from the
`INVALID_SIGNATURE` a forged token produces: "your JWKS entry is wrong" and
"someone forged a token" call for different responses.

---

[← Back to Crypt](../README.md)
