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
Signatures replay unless the signed payload carries a timestamp the app
checks — see the [roadmap](../ROADMAP.md).

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

const pact = new Pact({
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

## Registration & credential changes

- `register({ identifier, password?, grants?, metadata? })` — pbkdf2
  hashes, `createUser` persists, `register` event fires. Password-less
  registration (OAuth-only accounts) simply omits `password`.
- `setPassword(userId, password)` — hash + `updateUser`. Apps never hash.
- `issueApiKey(userId, { grants? })` / `issueToken(userId, { grants?,
  expiresAt? })` — mint, store the hash, return the secret ONCE. Scoped
  `grants` override the user's on later checks.

## TOTP — plain secondary verification

MFA is deliberately not a login state machine. The seed lives on the
stored user (`otpSecret` — encrypt at rest when warranted), and the APP
decides when to demand the second step after `login()`:

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

## Signing outbound content (HMAC)

The `HMAC` scheme above verifies signatures a _client_ produced. The
mirror operation — pact signing content YOUR api emits (signed response
bodies, outbound webhook payloads, signed URLs) — is `sign` /
`verifySignature`:

```typescript
import { Pact } from '@tundralibs/pact';

const pact = new Pact({
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
