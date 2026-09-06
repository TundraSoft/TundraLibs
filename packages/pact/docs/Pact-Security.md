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

`requestPasswordReset` returns `null` for an unknown identifier rather
than throwing, so a reset endpoint can answer uniformly.

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

The HMAC scheme verifies a signature over a caller-supplied canonical
payload; pact never guesses which request bytes are signed. Two things are
the app's contract, documented here because omitting them weakens the
scheme:

- **Canonicalization** must cover everything you need integrity for —
  method and path at minimum; add a timestamp and body digest for real
  deployments.
- **Replay**: pact verifies the signature, not uniqueness. Include a
  timestamp in the canonical string and reject stale ones (and/or track
  nonces) at the app layer. Native replay support is on the
  [roadmap](Pact-Roadmap.md).

## TOTP

`verifyMFA` is stateless RFC 6238 verification: a correct code verifies
repeatedly within its time window. Applications that must reject replays
(a code intercepted and reused seconds later) should record the last
accepted step per user and refuse repeats — one column next to
`mfa_secret`.

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
