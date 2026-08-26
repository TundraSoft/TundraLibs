# Errors & Events

## Error classes

All pact errors extend `PactError` (itself a `BaseError` from
`@tundralibs/utils`: typed `context`, cause chains, JSON serialization)
and carry a stable `code` — branch on `error.code` or `instanceof`,
never on message text.

| Class                 | Meaning                                                                            | Typical handling                                     |
| --------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PactDefinitionError` | configuration/programmer error — bad registry, missing hook/option, unknown method | fix the setup; 500                                   |
| `PactDeniedError`     | authorization denied (`assert`)                                                    | 403                                                  |
| `PactTokenError`      | pact-level token rejection (revoked / wrong type / reuse)                          | surfaces on `verifyFailed`; the call resolves `null` |
| `PactOAuthError`      | OAuth flow failure (state, exchange, profile, id_token)                            | 401/502 per code                                     |

```typescript
import { Pact, PactDeniedError } from '@tundralibs/pact';

declare const pact: Pact;
declare const principal: Parameters<typeof pact.assert>[0];

try {
  pact.assert(principal, 'Post', 'EDIT');
} catch (error) {
  if (error instanceof PactDeniedError) {
    // error.context: { code: 'PERMISSION_DENIED', module, permission }
  }
}
```

## Stable codes

The full union lives in `PactErrorCodes`
(`@tundralibs/pact/errors`) with a human label per code. Highlights:

- `MISSING_HOOK` — a capability was enabled/used without its storage
  hook wired (thrown at construction where possible, else at call time).
- `MISSING_OPTION` / `INVALID_OPTION` — absent `bits`/`secret`, or
  secret material contradicting the algorithm (HS\* length floor per
  RFC 7518 §3.2). See
  [Secrets & algorithms](Pact-Authentication.md) for the key-shape and length
  rules that raise these before you hit the error.
- `TOKEN_REVOKED` / `TOKEN_TYPE_MISMATCH` / `REFRESH_REUSED` — the
  token-path rejections; carried by the `verifyFailed` error, while the
  call itself resolves `null`.
- `EMPTY_REQUIREMENT` — an authorization check required **no** permissions
  (a raw `0n`, or an empty `any()`/`all()`); pact fails this closed and throws,
  because "require nothing" is almost always a bug rather than an allow.
- `PERMISSION_DENIED` and the catalog codes (`UNKNOWN_MODULE`,
  `UNKNOWN_PERMISSION`, `PERMISSION_NOT_IN_MODULE`,
  `INVALID_PERMISSION_BIT`, `DUPLICATE_PERMISSION_BIT`,
  `INVALID_GRANTS`).
- `UNKNOWN_STRATEGY` / `UNKNOWN_PROVIDER` — login/OAuth wiring mistakes.
- `OAUTH_STATE_MISMATCH`, `OAUTH_EXCHANGE_FAILED`,
  `OAUTH_PROFILE_FAILED`, `OAUTH_IDTOKEN_INVALID`,
  `OAUTH_JWKS_UNAVAILABLE` — the OAuth flow, see
  [OAuth](Pact-OAuth.md).

## Events

Subscribe via `_on<Event>` constructor options or `.on(event, handler)`.
The hardened `Events` base isolates listener faults: a throwing or
rejecting audit hook can never alter an operation's outcome or starve
later listeners.

| Event               | Fires when…                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `register`          | an account was provisioned                                       |
| `login`             | a `login()` succeeded (after the session mint)                   |
| `loginFailed`       | bad credentials (no error arg) or an operational failure (error) |
| `verifyFailed`      | a token failed verification — carries the typed error            |
| `denied`            | an `assert()` was denied (just before the throw)                 |
| `refreshReuse`      | a stale refresh generation was replayed — family revoked. ALERT. |
| `logout`            | a session/family ended (`logout`/`logoutAll`)                    |
| `idTokenUnverified` | an id_token was accepted decode-only under `'PREFERRED'`. ALERT. |

The two **ALERT** events are an intrusion signal, not decoration.
`refreshReuse` means a refresh token was replayed — the family is already
revoked, but force the user to re-authenticate and page on-call if it recurs.
`idTokenUnverified` means an id_token was accepted without a signature check
because JWKS was unreachable — investigate the outage and treat affected logins
as lower-assurance (or use the `'REQUIRED'` policy to make that case fail
instead).

```typescript
import { Pact } from '@tundralibs/pact';

const pact = Pact.create({
  bits: { READ: 1n },
  _onrefreshReuse: (userId, familyId) => {
    console.warn(`refresh reuse: user=${userId} family=${familyId}`);
  },
});
pact.on('denied', (_principal, module, permission) => {
  console.warn(`denied ${String(permission)} on ${module}`);
});
```

pact imports no logging or tracing package — the events are the
observability seam, wired at your composition root (slogger, tracer,
metro-man, or plain console). They are also the **only** audit trail for the
uniform-`null` outcomes: because `verify()`/`login()`/`authenticate()` never
throw on bad input, wiring `verifyFailed`/`loginFailed` is what lets you see —
and rate-limit — credential stuffing and token-forgery attempts. OAuth HTTP
additionally supports restler's `witness` tracing seam.
