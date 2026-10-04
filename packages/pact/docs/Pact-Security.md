# Security

The contracts and design decisions an integrator should know before
shipping: how failures map to responses, what pact hides on purpose, and
where the trust boundaries sit.

## Table of Contents

- [The error contract](#the-error-contract)
- [Enumeration resistance](#enumeration-resistance)
- [Bound principals](#bound-principals)
- [HMAC requests](#hmac-requests)
- [TOTP](#totp)
- [Password hashing](#password-hashing)
- [Content signing](#content-signing)
- [Trust boundaries](#trust-boundaries)

## The error contract

Authentication failures throw typed errors; authorization answers are
booleans (`assert` being the throwing convenience). Every `PactError`
carries a stable `code`; adapters map mechanically — this is exactly what
the shipped [middleware](../middleware/Pact-Middleware.md) does via
`failureResponse`:

| Codes                                                                                               | Response                                         |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `PACT_AUTH_FAILURE_CODES`: `INVALID_CREDENTIALS`, `NOT_ACTIVE`, `SESSION_EXPIRED`, `REFRESH_REUSED` | 401                                              |
| `PERMISSION_DENIED`                                                                                 | 403                                              |
| `USER_EXISTS`                                                                                       | 409                                              |
| Everything else (`MISSING_HOOK`, `INVALID_GRANTS`, ...)                                             | 500 — config/storage faults, never auth verdicts |

## Enumeration resistance

`INVALID_CREDENTIALS` is deliberately variable-free and collapsed: unknown
identifier, password-less account, and wrong password are the same error,
with comparable pbkdf2 work burned on every path (a dummy hash is verified
for unknown identifiers, so timing does not distinguish them either).
`NOT_ACTIVE` — which does carry the status, so the app can route
"verify your email" vs "suspended" — is reachable only after the password
verified, and is therefore not an existence oracle. What to disclose to
the end user is the application's call; the codes give it the choice.

`requestPasswordReset` and `requestEmailVerification` return `null` for an
unknown identifier rather than throwing, so those endpoints can answer
uniformly. The two flows share one token store, told apart by `purpose`:
a token minted for one flow is rejected — and consumed — by the other.

## Bound principals

`authenticate` and `principalOf(id)` return principals whose
`hasPermission`/`assert` evaluate against already-resolved grants. The
model is "an object is a proof with a shelf life":

- **Fresh** (within the freshness budget — the `principal` cache TTL, or
  60 seconds uncached) a check is pure bit math, no I/O.
- **Stale**, or after `invalidatePrincipal`/`revokeApiKey`/`clearCache`
  bump the revocation epoch, the object transparently re-resolves by its
  id and swaps its grants — a long-held reference (a WebSocket
  connection) self-heals and sees revocation at its next check.
- **Forged** objects do not work: the check methods close over the
  minting instance, so hand-built objects have nothing to call, and JSON
  cannot even represent bigint grants (deserialized masks clamp to no
  access). Structured clone strips the capability — across a process
  boundary you pass the id and re-resolve, by construction.

Evaluation fails closed throughout: unknown actors, junk ids, negative or
non-bigint masks, and modules absent from grants all deny. Definition
misuse (unknown module or permission name) throws instead — a typo must
never read as "denied".

## HMAC requests

The HMAC scheme verifies a signature over a canonical payload; the engine
never guesses which request bytes are signed — the
[middleware](../middleware/Pact-Middleware.md#signed-exchanges-hmac)
renders it from a template whose mandatory keys are the method, the path,
a timestamp, and an RFC 9530 body digest, rejects timestamps outside
`maxSkew`, and signs the response back over status, server timestamp, and
body digest. Calling `authenticate` directly makes canonicalization your
contract: cover at least what the default template covers.

- **Replay**: the timestamp window bounds it; it does not remove it. A
  nonce header is carried and echoed today, and a nonce store (reject a
  seen nonce within the window) is on the [roadmap](Pact-Roadmap.md) —
  until then, track nonces at the app layer where replays matter.
- **Payload confidentiality** is separate from integrity: TLS in transit,
  or the middleware's key-bound JWE option end to end. That option derives
  one AES-GCM key per API key (HKDF over the secret, salted with the key
  id) and uses random 96-bit IVs, so the usual per-key message bound
  applies across the key's lifetime — rotate keys rather than run one for
  years at high volume.

## TOTP

`verifyMFA` accepts a code within one 30-second step of now, and each code
works once:

- **Replay.** Once a step is accepted, that step and every earlier one are
  refused (RFC 6238 §5.2), so an intercepted code cannot be reused. The
  `claimTotpStep` hook stores the last step, e.g. a `totp_step` column next
  to `mfa_secret`. Without it pact remembers steps in process memory, which
  protects a single process only.
- **Guessing.** With three valid codes at any moment, unlimited attempts
  make a known password plus brute force practical. `options.mfa` allows
  `maxAttempts` (default 5) per `window` minutes (default 15). Past that,
  `verifyMFA` throws `MFA_LOCKED` even for a correct code, until the window
  ends; map it to 429. `attemptMFA` applies the same count but returns the
  lockout as `{ ok: false, reason: 'LOCKED', window }`, so a sign-in flow
  can answer it without a `try`. A success resets the count. Counts go through the
  `countMfaAttempt` / `resetMfaAttempts` hooks, or process memory without
  them.

Run more than one process? Implement all three hooks, or the protections
hold per process only.

## Password hashing

pact hashes passwords with crypt's `pbkdf2Hash`: 600 000 iterations of
SHA-256 by default. It does this at `register`, `setPassword`, password
reset, and for the dummy hash that unknown identifiers are verified against.
Each stored hash records its own count, so changing the settings never
breaks an existing login.

Cloudflare Workers refuses PBKDF2 above 100 000 iterations, so a Workers
deployment lowers the count:

```ts
import { Pact } from '@tundralibs/pact';

const pact = Pact.create({
  bits: { READ: 1n },
  modulePermissions: { Post: ['READ'] },
  options: { password: { iterations: 100_000 } },
});
```

Hashes written at a higher count cannot be checked on Workers. crypt throws a
`DigestError` for them rather than reporting a wrong password, so they surface
as a 500, not `INVALID_CREDENTIALS`. Those users need a password reset.

For anything else, such as a pepper (an HMAC under a server-side key before
hashing), supply the `hashPassword` and `verifyPassword` hooks. pact then
uses them everywhere it hashes, including the dummy hash. They must be
configured together, and the `password` option is refused alongside them.
`verifyPassword` returns `false` for a wrong password and throws only for a
failure that is not the user's.

## Content signing

`sign`/`verifySignature` HMAC arbitrary content. Without an explicit key
they derive one from `session.secret` via HKDF under a distinct info
label, so content signatures and JWTs can never validate as each other
even though one secret is configured.

## Trust boundaries

- **Your process is trusted.** In-process code can call anything; the API
  defends against accidents (fail-closed clamps, unforgeable bound
  principals, loud misconfiguration), not against the codebase itself.
- **Your cache engine is trusted once you opt in** — with write access to
  it, sessions can be minted and principals poisoned; with read access,
  cached API-key secrets leak. See [Caching](Pact-Caching.md).
- **Hooks see raw secrets by design** (API-key secret, TOTP seed) and are
  the place encryption-at-rest happens. See [Hooks](Pact-Hooks.md).
- **Grants never travel through client-reachable channels.** JWTs carry
  only ids; sessions store only ids; principals are re-resolved
  server-side. There is nothing signed-but-readable for a client to tamper
  with.

---

[← Back to Pact](../README.md)
