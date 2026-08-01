# Errors and Events

How `@tundralibs/pact` reports failures — the `PactError` hierarchy and its
stable error codes — and how it surfaces lifecycle moments through an event
map, so you can layer audit trails, revocation stores, and metrics on top of
a stateless kernel.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Errors](#errors)
- [Error Classes](#error-classes)
- [Error Codes](#error-codes)
- [Handling Errors](#handling-errors)
- [JWT Failures](#jwt-failures)
- [Events](#events)
- [Event Reference](#event-reference)
- [Subscribing to Events](#subscribing-to-events)
- [Related](#related)

## Errors

Every error PACT throws extends `PactError`, which in turn extends `BaseError`
from `@tundralibs/utils`. That shared base gives each error a typed `context`,
cause chains, and JSON serialization; `PactError` adds a `code` getter that
reads `context.code`, so you branch on a stable string instead of parsing
message text.

```
BaseError                 (@tundralibs/utils — typed context, cause, toJSON)
└─ PactError              (adds .code; catch to match any PACT error)
   ├─ PactDefinitionError (configuration / programmer bugs)
   ├─ PactDeniedError     (authorization denied — thrown by assert)
   ├─ PactTokenError      (token rejected by PACT — TOKEN_REVOKED only)
   └─ PactOAuthError      (OAuth protocol failures)
```

The four concrete classes split failures by how you should react: a
`PactDefinitionError` is a bug to fix in your setup (map it to a 500), a
`PactDeniedError` is a normal authorization outcome (map it to a 403), a
`PactTokenError` means a valid token was revoked, and a `PactOAuthError`
means an OAuth exchange with an upstream provider went wrong.

## Error Classes

| Class                 | When it is thrown                                                                                                                                     | Example code           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `PactError`           | Base class. Not thrown directly (its fallback code is `UNKNOWN`); catch it to match any PACT error at once.                                           | `UNKNOWN`              |
| `PactDefinitionError` | Configuration / programmer bugs — malformed registry, unknown module or permission, missing or invalid options, unknown strategy, unparseable grants. | `UNKNOWN_MODULE`       |
| `PactDeniedError`     | Authorization denied — a principal lacks a required permission. Thrown by `assert`; carries the typed `module` and `permission`.                      | `PERMISSION_DENIED`    |
| `PactTokenError`      | A signature-valid token was vetoed by the `isRevoked` seam during verification.                                                                       | `TOKEN_REVOKED`        |
| `PactOAuthError`      | OAuth protocol failure — callback state mismatch, a failed code-to-token exchange, or a failed profile fetch. Carries the `provider`.                 | `OAUTH_STATE_MISMATCH` |

## Error Codes

Every code from the `PactErrorCode` union, the class that carries it, and its
meaning. Branch on `err.code` rather than on message text.

| Code                       | Carried by            | Meaning                                                         |
| -------------------------- | --------------------- | --------------------------------------------------------------- |
| `UNKNOWN`                  | `PactError`           | Fallback when an error is constructed without an explicit code. |
| `MISSING_OPTION`           | `PactDefinitionError` | A required option was not provided.                             |
| `INVALID_OPTION`           | `PactDefinitionError` | An option value is invalid for the configuration.               |
| `DUPLICATE_PERMISSION_BIT` | `PactDefinitionError` | Two permissions map to the same bit value.                      |
| `INVALID_PERMISSION_BIT`   | `PactDefinitionError` | A permission bit must be a positive BigInt.                     |
| `UNKNOWN_MODULE`           | `PactDefinitionError` | Module is not declared in the module catalog.                   |
| `UNKNOWN_PERMISSION`       | `PactDefinitionError` | Permission is not declared in the permission registry.          |
| `PERMISSION_NOT_IN_MODULE` | `PactDefinitionError` | Permission is not applicable to the module.                     |
| `PERMISSION_DENIED`        | `PactDeniedError`     | Principal lacks the required permission.                        |
| `TOKEN_REVOKED`            | `PactTokenError`      | A structurally valid token was rejected by `isRevoked`.         |
| `INVALID_GRANTS`           | `PactDefinitionError` | A serialized grants payload could not be parsed.                |
| `UNKNOWN_STRATEGY`         | `PactDefinitionError` | No login strategy or OAuth provider with that name.             |
| `UNKNOWN_PROVIDER`         | `PactDefinitionError` | An OAuth config references an unknown provider preset.          |
| `OAUTH_STATE_MISMATCH`     | `PactOAuthError`      | The callback `state` did not match (CSRF guard).                |
| `OAUTH_EXCHANGE_FAILED`    | `PactOAuthError`      | The authorization-code to token exchange failed.                |
| `OAUTH_PROFILE_FAILED`     | `PactOAuthError`      | The userinfo / profile fetch (or id_token decode) failed.       |
| `OAUTH_IDTOKEN_INVALID`    | `PactOAuthError`      | An `id_token` failed signature, algorithm, or claim validation. |
| `OAUTH_JWKS_UNAVAILABLE`   | `PactOAuthError`      | The provider JWKS was unobtainable (`'required'` policy only).  |

## Handling Errors

Branch on `instanceof` when the reaction depends on the failure category — a
denial is a 403, a definition error is a bug:

```typescript
import { PACT, PactDefinitionError, PactDeniedError } from '@tundralibs/pact';

try {
  pact.assert('Post', 'DELETE', grants);
} catch (err) {
  if (err instanceof PactDeniedError) {
    // authorization outcome — err.module / err.permission are typed
    return respond(403, `denied: ${err.permission} on ${err.module}`);
  }
  if (err instanceof PactDefinitionError) {
    // a bug in how PACT was configured (e.g. UNKNOWN_MODULE) — fix the setup
    return respond(500, 'authorization is misconfigured');
  }
  throw err;
}
```

Branch on the stable `code` when one call can fail several ways and you want a
flat switch instead of a class ladder:

```typescript
import { PACT, PactError } from '@tundralibs/pact';

try {
  await pact.login('google', { code, verifier });
} catch (err) {
  if (err instanceof PactError) {
    switch (err.code) {
      case 'OAUTH_STATE_MISMATCH':
        return respond(400, 'stale or forged callback');
      case 'OAUTH_EXCHANGE_FAILED':
      case 'OAUTH_PROFILE_FAILED':
        return respond(502, 'upstream OAuth provider failed');
      case 'UNKNOWN_STRATEGY':
        throw err; // config bug — no provider named 'google'
    }
  }
  throw err;
}
```

Because `PactError` extends `BaseError`, every instance also exposes the shared
contract — useful for structured logging:

```typescript
import { PACT, PactError } from '@tundralibs/pact';

if (err instanceof PactError) {
  err.code; // stable PactErrorCode, or undefined when the site left it unset
  err.context; // typed metadata: { code, module?, permission?, provider?, ... }
  err.cause; // the wrapped upstream error, when one was chained
  JSON.stringify(err); // log-friendly structured payload (via toJSON)
}
```

## JWT Failures

PACT owns only one token failure of its own — revocation. A JWT with a bad
signature, a wrong `iss`/`aud`, or an expired `exp` is rejected by
`@tundralibs/crypt`, which throws its own `JWTError` (not a `PactError`). So
when verifying or refreshing, handle both:

```typescript
import { PACT, PactTokenError } from '@tundralibs/pact';
import { JWTError } from '@tundralibs/crypt/JWT';

try {
  const claims = await pact.verifyJWT(token);
} catch (err) {
  if (err instanceof PactTokenError) {
    // err.code === 'TOKEN_REVOKED' — your isRevoked seam vetoed a valid token
    return respond(401, 'token revoked');
  }
  if (err instanceof JWTError) {
    // bad signature, expired, or wrong iss/aud — raised by @tundralibs/crypt
    return respond(401, 'token invalid');
  }
  throw err;
}
```

## Events

PACT stays stateless — it stores no audit log, revocation list, or session.
Instead it emits events at each lifecycle moment, and you attach the
side-effects: write an audit row on `denied`, record a `jti` on `revoked`,
count logins on `login`. Events are emitted by the `PACT` facade, which
extends the `Options` emitter from `@tundralibs/utils`.

The `verify`, `login`, and `refresh` success events fire only **after** the
operation's outcome is final, and their listeners are isolated: an exception
— **thrown synchronously, or surfaced as a rejected promise from an async
(promise-returning) listener** — is swallowed, so a misbehaving audit
listener can neither reject the already-successful operation, route it
through a `*Failed` event, nor escape as a process-terminating unhandled
rejection. The failure-path emits (`verifyFailed`, `loginFailed`) are
isolated the same way: a throwing or rejecting listener there cannot replace
the typed error the caller branches on, and `loginFailed` fires exactly once
per attempt. A cryptographically valid token stays verified — and a minted
`autoIssue` JWT stays issued — even when your audit sink is down, including
an async sink whose write rejects.

Isolation is scoped to the emits PACT itself performs. It does not change
what a listener returns, so the inherited `emitSync(event, ...args)` still
behaves as documented if you emit an event yourself: listeners run one at a
time, each awaited before the next starts, and a listener that rejects
rejects your `emitSync` call. Only the fire-and-forget path PACT uses
internally swallows the rejection.

Handlers are also optional in the literal sense: an `_on<Event>` option (or
an `.on()` / `.once()` call) whose value is not a function — typically an
unset optional hook forwarded from your own config — is ignored rather than
registered, so it neither throws at construction nor blocks the listeners
registered after it.

## Event Reference

| Event               | Signature                                                                    | Fires when                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `granted`           | `(module: string, permission: string \| bigint, grants: PACTGrants) => void` | An `assert` permission check passed.                                                                                                                                                                                                                                                                                                                   |
| `denied`            | `(module: string, permission: string \| bigint, grants: PACTGrants) => void` | An `assert` permission check was denied — fires just before the throw.                                                                                                                                                                                                                                                                                 |
| `issue`             | `(token: string, claims: JWTPayload) => void`                                | A JWT was issued via `generateJWT` (a refresh emits `refresh` instead).                                                                                                                                                                                                                                                                                |
| `verify`            | `(claims: JWTPayload, token: string) => void`                                | A JWT passed verification — signature, claims, and the revocation seam. Also fires during a successful refresh.                                                                                                                                                                                                                                        |
| `verifyFailed`      | `(error: Error, token: string) => void`                                      | A `verifyJWT` call failed — bad signature/claims (`JWTError`) or revocation (`PactTokenError`). Once per call.                                                                                                                                                                                                                                         |
| `refresh`           | `(token: string, previous: string, claims: JWTPayload) => void`              | A JWT was refreshed — verified (including the revocation seam) then re-issued. `token` is new, `previous` the old.                                                                                                                                                                                                                                     |
| `revoked`           | `(claims: JWTPayload, token: string) => void`                                | The `isRevoked` seam vetoed a signature-valid token — fires alongside `verifyFailed`.                                                                                                                                                                                                                                                                  |
| `sync`              | `(groupIds: string[]) => void`                                               | Group grants were re-fetched through the `groupResolver` via `syncGroups()` or the `syncInterval` timer; `groupIds` are the ids that were refreshed (there is no value diff — the event fires even when a re-fetch returns identical grants). Not emitted when there was nothing cached to refresh, or when a concurrent `clear()` fenced every write. |
| `syncFailed`        | `(error: Error) => void`                                                     | A timer-driven sync failed (the resolver threw). Manual `syncGroups()` calls throw to the caller instead.                                                                                                                                                                                                                                              |
| `login`             | `(strategy: string, principal: PACTPrincipal, isNew: boolean) => void`       | A `login()` succeeded.                                                                                                                                                                                                                                                                                                                                 |
| `loginFailed`       | `(strategy: string, error?: Error) => void`                                  | A `login()` failed — bad credentials (no `error`) or an operational failure (strategy threw, `error` set). Once per attempt.                                                                                                                                                                                                                           |
| `idTokenUnverified` | `(provider: string, reason: string) => void`                                 | An `id_token` was accepted without a signature check because the JWKS was unobtainable (`'preferred'` policy). Claims were still validated; alert on this.                                                                                                                                                                                             |

## Subscribing to Events

Subscribe at construction with an `_on<Event>` option — the event name is
appended verbatim (so `verifyFailed` becomes `_onverifyFailed`). Each option
takes a single handler or an array of handlers:

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  bits: { READ: 1n, EDIT: 2n },
  modules: { Post: ['READ', 'EDIT'] },
  secret: process.env.PACT_SECRET!,
  // audit every denial; persist every revoked jti to your own store
  _ondenied: (module, permission) => audit.log('denied', module, permission),
  _onrevoked: (claims) => revocationStore.record(String(claims.jti)),
});
```

Or attach later with `.on(event, handler)` — the same events, registered
imperatively:

```typescript
pact.on('login', (strategy, principal, isNew) => {
  metrics.increment(`login.${strategy}.${isNew ? 'signup' : 'return'}`);
});

pact.on('verifyFailed', (error, token) => {
  audit.log('token.reject', error.message);
});
```

## Related

- [Authorization](./Pact-Authorization.md) — permission bitmasks, the module
  catalog, and `assert` (the source of `PactDeniedError`).
- [Tokens](./Pact-Tokens.md) — JWT issue/verify/refresh, the `isRevoked` seam,
  and where `PactTokenError` and crypt's `JWTError` come from.

---

[← Back to Pact](../README.md)
