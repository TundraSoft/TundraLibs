# Crypt-JWT-Errors

Every failure `@tundralibs/crypt/JWT` raises, the stable code it carries, and
— because these are security decisions — exactly what each one does and does
not prove about the token.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [The `JWTError` Class](#the-jwterror-class)
- [Error Codes](#error-codes)
- [What a Code Proves](#what-a-code-proves)
- [Code Reference](#code-reference)
- [Handling Errors](#handling-errors)
- [Related](#related)

## Overview

The JWT module raises exactly one error class, `JWTError`, for every failure
in `issueJWT`, `verifyJWT`, `decodeJWT`, and `refreshJWT`. The failure mode is
carried as a stable code in `error.context.code`, drawn from the 12 keys of
`JWTErrorCodes`.

Two things about that are easy to get wrong, and both matter:

- **The code lives on `context`, not on the error.** `JWTError` has no `.code`
  getter — read `err.context.code`. (This differs from `PactError` and
  `OqlError`, which do expose `.code`.)
- **Never branch on `err.message`.** Messages are built from a template per
  code and interpolate a `causeMessage`; when a throw site supplies none, the
  literal text `${causeMessage}` is left in the message. It is diagnostic
  text, not an API.

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

## The `JWTError` Class

```typescript
import { JWTError } from '@tundralibs/crypt/JWT';

const err = new JWTError('INVALID_SIGNATURE', {
  causeMessage: 'HMAC verification failed',
});

err.name; // 'JWTError'
err.context.code; // 'INVALID_SIGNATURE' — branch on this
err.message; // 'JWT signature verification failed - HMAC verification failed'
err.cause; // the wrapped upstream error, when a throw site chained one
JSON.stringify(err); // structured payload, via BaseError's toJSON
```

`JWTError` extends `BaseError` from `@tundralibs/utils`, so every instance
carries a typed `context`, an optional `cause` chain, and JSON
serialisation. Beyond `code`, `context` may carry `header`, `payload`,
`causeMessage`, and whatever else the throw site found useful (`algorithm`,
`expectedCurve`, `missingClaims`, `exp`, `now`, `tolerance`, …). Those extra
keys are diagnostic: they are documented per code below, but only `code` is
guaranteed to be present.

### Unrecognised codes become `INVALID_JWT`

The constructor validates the code against `JWTErrorCodes`. Anything not in
that table is rewritten to `INVALID_JWT`, and the original is preserved in
`context.originalCode`:

```typescript
import { JWTError } from '@tundralibs/crypt/JWT';

// A code outside the table — e.g. from a wrapper layer of your own.
const err = new JWTError('SOMETHING_ELSE' as never);

err.context.code; // 'INVALID_JWT'
err.context.originalCode; // 'SOMETHING_ELSE'
```

This keeps `context.code` exhaustively switchable, but it means
`INVALID_JWT` is ambiguous: it is both a real code with its own throw sites
**and** the bucket every unknown code falls into. When you see it, check
`context.originalCode` — if it is set, the error did not originate from a
JWT throw site and the real code is there.

### The code type is not exported

`@tundralibs/crypt/JWT` exports `JWTError` and `JWTErrorCodes`, but not the
`JWTErrorCode` union type. Derive it from the codes table when you need to
name it:

```typescript
import { JWTErrorCodes } from '@tundralibs/crypt/JWT';

type JWTErrorCode = keyof typeof JWTErrorCodes;

const handled: JWTErrorCode[] = ['EXPIRED_TOKEN', 'INVALID_SIGNATURE'];
console.log(handled.length);
```

You rarely need it: `err.context.code` is already typed as that union after
an `instanceof JWTError` check.

## Error Codes

All 12 codes in `JWTErrorCodes`.

| Code                    | Raised by                             | Meaning                                                                                                      |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `EXPIRED_TOKEN`         | `verifyJWT`                           | Signature was valid; `exp` is in the past.                                                                   |
| `NOT_ACTIVE`            | `verifyJWT`                           | Signature was valid; `nbf` is in the future.                                                                 |
| `MAX_AGE_EXCEEDED`      | `verifyJWT`                           | Signature was valid; the token is older than the caller's `maxAge`.                                          |
| `INVALID_CLAIMS`        | `verifyJWT`                           | Signature was valid; a claim did not match what the caller required.                                         |
| `INVALID_SIGNATURE`     | `verifyJWT`                           | The signature does not match. **The token is not authentic.**                                                |
| `INVALID_FORMAT`        | `verifyJWT`, `decodeJWT`              | Not three dot-separated parts, or not a non-empty string.                                                    |
| `INVALID_HEADER`        | `issueJWT`, `verifyJWT`, `decodeJWT`  | The JOSE header is missing, unparseable, not an object, has no `alg`, or has a rejected `typ`.               |
| `INVALID_PAYLOAD`       | `issueJWT`, `verifyJWT`, `decodeJWT`  | The claims set is unparseable, not an object, or has a non-numeric time claim.                               |
| `UNSUPPORTED_ALGORITHM` | `issueJWT`, `verifyJWT`               | Four distinct conditions — see [below](#unsupported_algorithm). One of them is an attack signal.             |
| `INVALID_SECRET`        | `issueJWT`, `verifyJWT`, `refreshJWT` | The key argument is the wrong shape, or could not be imported.                                               |
| `INVALID_JWT`           | `issueJWT`                            | A payload being signed has a non-numeric `exp`/`nbf`/`iat` — **and** the fallback for any unrecognised code. |
| `UNKNOWN_ERROR`         | `issueJWT`                            | Signing threw for a reason the module does not model. Inspect `cause`.                                       |

## What a Code Proves

`verifyJWT` runs its checks in a fixed order, and the code you catch tells
you how far the token got. This is the distinction to get right — treating
an `EXPIRED_TOKEN` like an `INVALID_SIGNATURE` throws away information, and
treating an `INVALID_SIGNATURE` like an `EXPIRED_TOKEN` is a vulnerability.

| Stage                             | Codes                                                                                  | Token authenticated? |
| --------------------------------- | -------------------------------------------------------------------------------------- | -------------------- |
| Structure, header, algorithm, key | `INVALID_FORMAT`, `INVALID_HEADER`, `UNSUPPORTED_ALGORITHM`, `INVALID_SECRET`          | **No**               |
| Signature check                   | `INVALID_SIGNATURE`                                                                    | **No**               |
| Claims-set decode and validation  | `INVALID_PAYLOAD`, `EXPIRED_TOKEN`, `NOT_ACTIVE`, `MAX_AGE_EXCEEDED`, `INVALID_CLAIMS` | **Yes**              |

A code from the last row means the signature already verified against your
key: the token is genuine and its claims are trustworthy, it simply is not
acceptable right now. That is what makes a refresh flow safe to key off
`EXPIRED_TOKEN` — you know the bearer once held a validly signed token.
Anything from the first two rows proves nothing about the token's origin;
its `header` and `payload` (present in `context` on several codes) are
**unverified attacker-controlled data** and must not be logged as fact or
used to look up an account.

`decodeJWT` is not a verification function — it never checks a signature.
The `INVALID_FORMAT`, `INVALID_HEADER`, and `INVALID_PAYLOAD` it raises
carry no authentication meaning at all, and a `decodeJWT` call that
_succeeds_ proves nothing whatsoever.

## Code Reference

"Extra context" names the keys a throw site adds to `err.context` beyond
`code` and `causeMessage`.

### `EXPIRED_TOKEN`

The token's `exp` claim is in the past, allowing for the configured clock
`tolerance`. Raised by `verifyJWT` only, after the signature verified — see
[What a Code Proves](#what-a-code-proves).

**Fix:** this is a normal outcome, not a bug. Refresh the token or
re-authenticate. If tokens are expiring earlier than you expect, check
`context.now` against `context.exp` — a skewed clock is the usual culprit,
and `tolerance` exists to absorb it. Note the message template carries no
`${causeMessage}`, so this message is always exactly `JWT token is expired`.

**Extra context:** `exp`, `now`, `tolerance`.

### `NOT_ACTIVE`

The token's `nbf` ("not before") claim is in the future, allowing for
`tolerance` — the token is genuine but has not started being valid yet.
Raised by `verifyJWT` only, after the signature verified.

**Fix:** retry after `nbf`, or fix the issuer's clock. Do not treat this as
"invalid token" in a UI — it usually means clock skew between issuer and
verifier, and the fix is `tolerance`, not rejection.

**Extra context:** `nbf`, `now`, `tolerance`.

### `MAX_AGE_EXCEEDED`

The token is older than the `maxAge` the _caller_ passed to `verifyJWT`,
measured from its `iat` claim. Independent of `exp`: a token can be well
within its own expiry and still fail this, because `maxAge` is your policy,
not the issuer's. Raised after the signature verified.

**Fix:** re-authenticate to obtain a fresher token, or raise `maxAge`. Note
that if you pass `maxAge` and the token has no `iat` claim, you get
[`INVALID_CLAIMS`](#invalid_claims) instead — the check cannot run.

**Extra context:** `iat`, `maxAge`, `actualAge`.

### `INVALID_CLAIMS`

A claim did not match what the caller required. Raised after the signature
verified, so the claims are authentic — they are just not the ones you asked
for. Covers several conditions, distinguished by the extra context keys:

- `iss` not among the accepted issuers (`expectedIssuers`, `actualIssuer`)
- `sub` not the expected subject (`expectedSubject`, `actualSubject`)
- `aud` not among the accepted audiences (`expectedAudiences`,
  `actualAudience`)
- `jti` not the expected token id (`expectedJwtId`, `actualJwtId`)
- one of `options.requiredClaims` absent (`missingClaims`, `requiredClaims`)
- `maxAge` requested but the token has no `iat` to measure from (`maxAge`)
- `aud` present but malformed — not a string or array of strings

**Fix:** these are policy mismatches. Most often the token is genuine but
meant for a different audience or issued by a different tenant — reject the
request. If it is your own token failing, compare the `expected*` and
`actual*` context keys; they are supplied precisely so you do not have to
re-decode the token to see why.

**Security note:** the `aud` and `iss` checks are the real defence against
cross-service token confusion (a token minted for service A being replayed
at service B). Passing `options.aud` / `options.iss` is what turns them on;
without them, no such check runs and no `INVALID_CLAIMS` is raised.

### `INVALID_SIGNATURE`

The signature did not verify against the supplied key. **The token is not
authentic** — it was forged, tampered with, or signed by a different key.

Raised by `verifyJWT` for two situations that mean the same thing: the
verification returned false, or the underlying crypto operation threw (the
thrown error is chained as `cause`).

**Fix:** reject the request. There is no benign interpretation. If _every_
token fails this way, you have a key mismatch rather than an attack —
confirm the verifier holds the public key (or shared secret) matching the
issuer's signing key, and that the token was not re-encoded in transit.
Never fall back to reading the payload of a token that failed here.

**Extra context:** none beyond `causeMessage`; a wrapped crypto error, if
any, is on `cause`.

### `INVALID_FORMAT`

The token is not a JWT structurally: not a non-empty string, or not exactly
three dot-separated parts, or one of those parts is empty. Raised by
`verifyJWT` and `decodeJWT` before anything is decoded.

**Fix:** the value you passed is not a token. In practice this is a wiring
bug — an `Authorization` header passed with its `Bearer` prefix still
attached, an empty string from a missing cookie, or `undefined` stringified.
Strip the scheme prefix and check for absence before calling.

**Extra context:** none beyond `causeMessage`.

### `INVALID_HEADER`

The JOSE header is present but unusable. Conditions:

- it is not valid base64url JSON (the parse error is chained as `cause`)
- it parsed to something other than a JSON object (`null`, a number, an
  array)
- it has no `alg`, or `alg` is not a non-empty string
- `typ` is present but is not a string
- the caller passed `options.typ` and the token's `typ` is missing or not in
  the accepted set (`actualType` in context)
- on the issue path: `issueJWT` was given a `typ` option that is not a
  non-empty string

**Fix:** for the `typ` cases, note that `typ` is only checked when you ask —
`verifyJWT` ignores it by default, because many valid profiles (`at+jwt`,
`dpop+jwt`, Apple's `id_token`) carry types no general verifier can
enumerate. If you pass `options.typ`, the header must carry a matching one;
both sides are normalised per RFC 7515 §4.1.9, so case and an omitted
`application/` prefix do not matter. For the other cases, the token is
malformed — reject it.

**Extra context:** `header` (**unverified** at this stage), `actualType`.

### `INVALID_PAYLOAD`

The claims set is unusable, or a time claim has the wrong type. Conditions:

- the payload is not valid base64url JSON (parse error chained as `cause`)
- it parsed to something other than a JSON object
- `exp`, `nbf`, or `iat` is present but is not a number (`claim` in context
  names which) — this is the **verify**-path check; the issue path reports
  the same problem as [`INVALID_JWT`](#invalid_jwt)
- on the issue path: `issueJWT` was given a payload that is not an object

**Fix:** if you are issuing, pass an object and keep time claims numeric
(seconds since the epoch, not `Date` objects or ISO strings). If you are
verifying, the issuer is producing a malformed claims set — reject.

Note the position of this code: in `verifyJWT` the payload is decoded
_after_ the signature check, so an `INVALID_PAYLOAD` from `verifyJWT` is
still an authentic token with a bad body. From `decodeJWT` it means nothing
of the kind.

**Extra context:** `claim` (for the time-claim case).

### `UNSUPPORTED_ALGORITHM`

**This code covers four distinct conditions, and they are not equally
benign.** If you do anything more than reject on it, distinguish them via
`context` — the extra keys differ per condition.

1. **Unknown algorithm.** The header's `alg` is not one this library
   implements. Context: `algorithm`, and on the verify path
   `supportedAlgorithms`.
2. **Algorithm not allowed by the caller.** The `alg` is supported but is
   not in the `options.algorithm` allowlist you passed to `verifyJWT`.
   Context: `expectedAlgorithm`, `actualAlgorithm`. This is your pinning
   policy working as intended.
3. **Algorithm confusion — a key/header family mismatch.** The supplied key
   belongs to a different family than the token's `alg` claims: an RSA key
   against an `ES*` token, or a shared secret against an `RS*` token. This
   is the classic JWT algorithm-confusion attack, where an attacker re-signs
   a token with an RSA _public_ key treated as an HMAC secret. Context:
   `algorithm` plus the two families.
4. **Curve mismatch.** An EC key on the wrong curve for the requested `ES*`
   algorithm (e.g. a P-256 key for `ES384`). Context: `algorithm`,
   `expectedCurve`, and the supplied curve.

**Fix:** conditions 1, 2, and 4 are configuration — pin the algorithms you
accept, and hand `verifyJWT` a key that matches. Condition 3 is different:
the library refusing the operation _is_ the mitigation, and a burst of them
against production traffic is an attack signal worth alerting on, not a
config error to relax. Whatever you do, do not "fix" any of these by
widening `options.algorithm` to accept whatever the token asks for — that
is the vulnerability.

Both `issueJWT` and `verifyJWT` raise this code; the issue-path variants are
conditions 1, 3, and 4, checked against the key you are signing with.

### `INVALID_SECRET`

The key you supplied is unusable — this is about _your_ key material, never
about the token. Conditions:

- the key argument is not a non-empty string, a `CryptoKey`, or a JWK object
  (`issueJWT` and `verifyJWT`)
- the key could not be normalised or imported by the crypto layer — a
  malformed PEM, a JWK missing required members, a key the runtime rejects.
  The underlying error is chained as `cause` and its text becomes
  `causeMessage`
- `refreshJWT` was given the wrong key shape for the token's family: `RS*`,
  `PS*`, and `ES*` tokens need `{ verifyKey, signKey }` (verifying uses the
  public key, re-signing the private one), while `HS*` tokens need a single
  secret string

**Fix:** check what you loaded. An empty string from an unset environment
variable is the single most common cause, and it surfaces here rather than
as a signature failure. For the `refreshJWT` case, pass the pair form for
asymmetric algorithms.

**Extra context:** `algorithm` (where the key is being matched to one).

### `INVALID_JWT`

Two unrelated things arrive under this code — check `context.originalCode`
to tell them apart.

**As a real code**, it is raised by `issueJWT` (through `validatePayload`)
when the payload you are about to sign has an `exp`, `nbf`, or `iat` that is
present but not a number. `context.originalCode` is **absent** in this case.

**As the fallback**, it is what the `JWTError` constructor substitutes for
any code outside `JWTErrorCodes`, preserving the original in
`context.originalCode`. Nothing inside this package does that — it happens
when a wrapper layer of your own constructs a `JWTError` with its own code.

**Fix:** for the issue path, pass numeric time claims (epoch seconds). For
the fallback, read `context.originalCode` and handle the real code there.

**Extra context:** `originalCode` (fallback case only).

### `UNKNOWN_ERROR`

`issueJWT` wraps its signing step, and anything unexpected thrown there —
a runtime rejecting the key, an unavailable WebCrypto primitive — surfaces
as this code with the original attached as `cause`.

**Fix:** read `err.cause`; the real diagnosis is there, not in the code. It
represents a bug or an environment problem rather than a caller error.

**Note:** the JSDoc on `verifyJWT` lists `UNKNOWN_ERROR` among its throws,
but the verification path has no such throw site — every failure there maps
to one of the specific codes above. Do not build a verify-path fallback
around it; the safe default is to treat any unrecognised failure as a
rejection.

**Extra context:** none beyond `causeMessage`; the original error is on
`cause`.

## Handling Errors

Catch `JWTError` and switch on `err.context.code`:

```typescript
import { JWTError, verifyJWT } from '@tundralibs/crypt/JWT';

declare const token: string;
declare const secret: string;

try {
  const payload = await verifyJWT(token, secret);
  console.log('authenticated', payload.sub);
} catch (err) {
  if (err instanceof JWTError) {
    switch (err.context.code) {
      case 'EXPIRED_TOKEN':
        // Authentic but stale — safe to offer a refresh.
        console.warn('token expired at', err.context.exp);
        break;
      case 'NOT_ACTIVE':
        // Authentic but early — usually clock skew.
        console.warn('token not active until', err.context.nbf);
        break;
      case 'INVALID_SIGNATURE':
        // NOT authentic. Reject; never read the payload.
        console.error('forged or tampered token');
        break;
      case 'UNSUPPORTED_ALGORITHM':
        // May be an algorithm-confusion attempt — worth alerting on.
        console.error('algorithm rejected:', err.context.causeMessage);
        break;
      case 'INVALID_SECRET':
        // Our own key is wrong — an outage, not a bad request.
        throw err;
      default:
        console.error('rejected:', err.context.code);
    }
  } else {
    throw err;
  }
}
```

The distinction that matters most is authenticated-versus-not. Encode it
once rather than at every call site:

```typescript
import { JWTError, JWTErrorCodes } from '@tundralibs/crypt/JWT';

/** Codes raised only after the signature has verified. */
const POST_SIGNATURE: ReadonlySet<keyof typeof JWTErrorCodes> = new Set([
  'EXPIRED_TOKEN',
  'NOT_ACTIVE',
  'MAX_AGE_EXCEEDED',
  'INVALID_CLAIMS',
  'INVALID_PAYLOAD',
]);

/**
 * True when the failure came from `verifyJWT` *after* the signature
 * verified — the token is genuine, just not acceptable.
 */
const isAuthenticatedFailure = (err: unknown): boolean =>
  err instanceof JWTError && POST_SIGNATURE.has(err.context.code);
```

Note the caveat that makes this a `verifyJWT`-only helper: `INVALID_PAYLOAD`
is post-signature from `verifyJWT`, but `decodeJWT` raises the same code
with no signature check at all. Do not reuse the predicate on a `decodeJWT`
failure.

Because `INVALID_JWT` doubles as the unknown-code fallback, check
`originalCode` before assuming which one you have:

```typescript
import { JWTError } from '@tundralibs/crypt/JWT';

const describe = (err: JWTError): string => {
  if (err.context.code !== 'INVALID_JWT') return err.context.code;
  const original = err.context.originalCode;
  return original === undefined
    // A real INVALID_JWT: issueJWT rejected a non-numeric time claim.
    ? 'INVALID_JWT (bad exp/nbf/iat while signing)'
    // Remapped from a code this package does not know.
    : `INVALID_JWT (remapped from ${original})`;
};

console.log(typeof describe);
```

## Related

- [Crypt-JWT](../Crypt-JWT.md) — the JWT API these errors come from:
  `issueJWT`, `verifyJWT`, `decodeJWT`, `refreshJWT`, and their options.
- [Crypt-Sign](../../sign/Crypt-Sign.md) — the signing layer whose key
  handling surfaces as `INVALID_SECRET` and `UNSUPPORTED_ALGORITHM`.

---

[← Back to Crypt](../../README.md)
