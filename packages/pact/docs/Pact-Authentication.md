# Authentication — schemes, logins, and TOTP

Two verbs split the work:

- **`authenticate(credential)`** — per-request checks. The framework
  extracts a credential from the transport and pact validates it. No
  session is minted.
- **`login(method, credentials)`** — session-minting flows (password,
  OAuth, custom strategies). Returns tokens.

## `authenticate` — the five schemes

pact never parses headers or cookies. The framework passes ONE extracted
`PactCredential`, discriminated by `scheme`; pact resolves it to a
principal or `null` (bad credential, unknown key, revoked, expired, or a
non-`ACTIVE` user — uniformly `null`).

| Scheme     | Framework passes                  | pact verifies via                            |
| ---------- | --------------------------------- | -------------------------------------------- |
| `'BASIC'`  | `identifier` + `password`         | crypt pbkdf2 against the stored hash         |
| `'BEARER'` | a pact-issued session token       | [the `verify` contract](Pact-Sessions.md)    |
| `'TOKEN'`  | one opaque string                 | sha-256 → `getToken` lookup by hash          |
| `'APIKEY'` | `keyId` + presented `secret`      | sha-256, constant-time compare               |
| `'HMAC'`   | `keyId` + `signature` + `payload` | crypt HMAC against the stored signing secret |

```typescript
import { Pact } from '@tundralibs/pact';

declare const pact: Pact;
declare const headers: Headers;

// the FRAMEWORK owns extraction…
const header = headers.get('authorization') ?? '';
const space = header.indexOf(' ');
const [scheme, value] = space === -1
  ? [header, '']
  : [header.slice(0, space), header.slice(space + 1)];

// …and pact only sees extracted values
if (scheme === 'Basic' && value !== '') {
  const decoded = atob(value);
  const colon = decoded.indexOf(':');
  await pact.authenticate({
    scheme: 'BASIC',
    identifier: decoded.slice(0, colon),
    password: decoded.slice(colon + 1),
  });
} else if (scheme === 'Bearer' && value !== '') {
  await pact.authenticate({ scheme: 'BEARER', token: value });
}
```

**HMAC notes.** The framework decides WHAT was signed (raw body, a
canonical string) and passes it as `payload` — pact never reconstructs
requests. The stored key must carry the retrievable `secret` (not just a
hash): proof-of-possession verification recomputes the signature.

**Pitfall — replay.** An HMAC signature is valid _forever_: a captured
`(payload, signature)` pair verifies again and again unless you make the
payload single-use. The ideal is to fold a **timestamp and a nonce** into the
signed `payload`, reject anything outside a small clock-skew window, and
remember recently-seen nonces to reject reuse. pact verifies the signature but
cannot see freshness inside an opaque payload, so that check is yours (a
built-in `maxSkew` convenience is on the [roadmap](../ROADMAP.md)).

## `login` — session-minting methods

- **`'password'`** — enabled by the `password` option.
  `{ identifier, password }` (rename the key with
  `password: { identifierField: 'email' }`) → pbkdf2 verify → session.
- **An OAuth instance name** — every key of the `oauth` option is a login
  method: `login('google', { code, verifier, expectedState, expectedNonce })`.
  See [OAuth](Pact-OAuth.md).
- **A custom strategy** — the escape hatch for methods something ELSE
  verifies (LDAP, magic links, SSO): a named function returning a typed
  result union.

```typescript
import { Pact } from '@tundralibs/pact';
import type { PactStoredUser } from '@tundralibs/pact/types';

declare const ldap: {
  bind(user: string, pass: string): Promise<PactStoredUser | null>;
};

const pact = Pact.create({
  bits: { READ: 1n },
  secret: 'a-256-bit-shared-secret-for-hs256!',
  strategies: {
    ldap: async (creds) => {
      const { user, pass } = creds as { user: string; pass: string };
      const found = await ldap.bind(user, pass);
      return found !== null ? { ok: true, user: found } : { ok: false };
    },
  },
});
await pact.login('ldap', { user: 'a', pass: 'b' });
```

`login` returns `null` for bad credentials (emitting `loginFailed` with
no error); operational failures — a hook or provider threw — emit
`loginFailed` **with** the error and rethrow, so outages never read as
wrong passwords.

## Secrets & algorithms

Session tokens (and `sign()`) are only as strong as the key behind them. The
`secret` + `algorithm` options are **engine configuration, held out of the
option store** — never hook or database data. Load them from an env var or a
secret manager; never commit them, and never keep them in the same table your
`getUser`/`getSession` hooks read (a store compromise must not also hand over
the token-forging key). Two families, chosen by `algorithm`:

- **`HS*` (HMAC — the default `HS256`)** — one shared secret string that both
  signs and verifies. RFC 7518 §3.2 sets a length floor: **≥ 32 bytes for
  `HS256`, ≥ 48 for `HS384`, ≥ 64 for `HS512`** (pact rejects a short secret
  at construction with `INVALID_OPTION`). Simple and fast — but every service
  that verifies also holds the key that _mints_. Fine inside one trust domain;
  wrong when a verifier must not be able to forge.
- **`RS*` (RSA — `RS256`/`RS384`/`RS512`)** — a `{ privateKey, publicKey }`
  PEM pair. pact signs with the private key; anyone holding the public key (or
  a JWKS endpoint) verifies _without_ being able to mint. Choose this when
  tokens cross a trust boundary: a gateway that verifies but must not forge, or
  third-party consumers.

Do **not** cross-wire the families — an `HS*` algorithm with a key pair, or an
`RS*` algorithm with a plain string, is rejected (`INVALID_OPTION`); the shape
of `secret` must match. Because an `RS*` config carries no shared HMAC secret,
`sign()` then **requires** an explicit `key` argument — calling it bare throws.

## Registration & credential changes

- `register({ identifier, password?, grants?, metadata? })` — pbkdf2
  hashes, `createUser` persists, `register` event fires. Password-less
  registration (OAuth-only accounts) simply omits `password`.
- `setPassword(userId, password)` — hash + `updateUser`. Apps never hash.
- `issueApiKey(userId, { grants? })` / `issueToken(userId, { grants?,
  expiresAt? })` — mint, store only the **sha-256 hash**, return the secret
  **once**. Show it to the user immediately; it is unrecoverable by design, so
  a lost secret means re-issue, never lookup — and never log or persist the
  plaintext. Scoped `grants` override the user's on later checks. (The one
  exception: an `HMAC` api-key must keep its raw `secret` to recompute
  signatures — encrypt that at rest.)

## TOTP — plain secondary verification

MFA is deliberately not a login state machine. The seed lives on the stored
user (`otpSecret`), and the APP decides when to demand the second step after
`login()`. **Treat the seed as a bearer secret:** anyone who can read it can
generate valid codes, so encrypt it at rest and never return it through a
`getUser({ by: 'ID' })` path used to build a principal — expose it only to
`enrollOtp`/`verifyOtp`:

```typescript
import { Pact } from '@tundralibs/pact';

declare const pact: Pact;

// enrollment: store the seed, show the QR
const { url } = await pact.enrollOtp('user-1', {
  accountName: 'a@x.io',
});
// render `url` (otpauth://…) as a QR code

// later, after a successful password login:
const ok = await pact.verifyOtp('user-1', '123456');
```

`verifyOtp` is `false` for a missing/unenrolled/non-`ACTIVE` user or a
wrong code — never a throw.

**Pitfall — code replay.** `verifyOtp` keeps no used-code state (MFA is not a
state machine), and crypt accepts a code across a small ±1-step window (~90s),
so the **same code verifies more than once** within that window. A captured or
resubmitted code passes again until it rolls out. If you need true single-use,
record the last-accepted code (or time-step) per user and reject a repeat
yourself.

## Signing outbound content (HMAC)

The `HMAC` scheme above verifies signatures a _client_ produced. The
mirror operation — pact signing content YOUR api emits (signed response
bodies, outbound webhook payloads, signed URLs) — is `sign` /
`verifySignature`:

```typescript
import { Pact } from '@tundralibs/pact';

const pact = Pact.create({
  bits: { READ: 1n },
  secret: 'a-256-bit-shared-secret-for-hs256!',
});

const body = JSON.stringify({ ok: true });
const signature = await pact.sign(body); // send alongside the response
await pact.verifySignature(body, signature); // true
```

With no explicit `key`, pact derives the signing key from the configured
`secret` via **HKDF** under a distinct domain label — never the raw JWT
signing secret. So content you sign can never be replayed as a valid JWT
signature under the same secret, even though both are HMAC. Pass an
explicit `key` to sign with your own (required when pact holds an RSA key
pair, which carries no shared HMAC secret):

```typescript
import { Pact } from '@tundralibs/pact';

declare const pact: Pact;

const sig = await pact.sign('webhook payload', 'per-endpoint-secret');
await pact.verifySignature('webhook payload', sig, 'per-endpoint-secret');
```

Signatures replay unless the signed content carries a timestamp/nonce the
verifier checks — the same caveat as the inbound `HMAC` scheme.
