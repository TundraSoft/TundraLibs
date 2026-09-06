# Passkeys

Passwordless sign-in with WebAuthn credentials: four ceremony methods
over the same hook-and-session machinery as every other login. pact
verifies the ceremonies server-side; the browser half is two calls on
the standard JSON APIs, shown in the runnable
[passkey-signin example](../examples/passkey-signin/README.md).

## Table of Contents

- [Configuration](#configuration)
- [Registration](#registration)
- [Login](#login)
- [Verification and failure semantics](#verification-and-failure-semantics)
- [Clone detection](#clone-detection)
- [Scope](#scope)

## Configuration

```typescript
import { Pact } from '@tundralibs/pact';

const pact = Pact.create({
  bits: { READ: 1n },
  modulePermissions: { Notes: ['READ'] },
  hooks: {
    /* getUser + the four passkey hooks — see below */
  },
  options: {
    passkeys: {
      rpId: 'example.com', // the domain credentials are scoped to
      rpName: 'Example',
      origins: ['https://app.example.com'],
      // userVerification: 'PREFERRED' | 'REQUIRED' | 'DISCOURAGED'
      // algorithms: ['ES256', 'RS256']
      // timeout: 60000
    },
  },
});
```

Option values follow pact's uppercase convention; pact maps them to the
lowercase wire values WebAuthn expects. Configuring `passkeys` makes
`getPasskey`, `getPasskeys`, `savePasskey`, `updatePasskeyCounter`, and
`getUser` required — checked at construction, so a missing hook fails at
boot rather than surfacing mid-request. The stored shape is
`PactStoredPasskey` (public key as a JWK string; nothing in it is
secret); a suggested table lives in [Storage](Pact-Storage.md).

## Registration

An authenticated flow — the caller vouches for `userId` (a signed-in
user adding a device, or a signup that just created the account):

```ts ignore
// 1. Begin: options for the browser, a challenge for the app to stash.
const begin = await pact.beginPasskeyRegistration(userId, displayName);
await stash(begin.challenge);

// browser: navigator.credentials.create({
//   publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(begin.options),
// }) → credential.toJSON() back to the server

// 2. Finish: verify and persist.
const record = await pact.finishPasskeyRegistration(userId, responseJson, {
  challenge: await unstash(),
});
```

The challenge is app-owned between the calls, exactly like the OAuth
`state` — pact holds no ceremony state, so **the app must bind finish to
its begin**: authenticate the finish call as the same `userId` the
ceremony was begun for, or key the challenge stash by user and ceremony
kind (`Map<challenge, { kind, userId }>`, as the example does). Under
attestation policy `none` a registration response needs no real
authenticator, so an unbound finish endpoint would let anyone attach
their own passkey to any account. Both ceremonies also re-check that the
user exists and is active at finish time. Existing credentials go into
`excludeCredentials`, so an authenticator refuses to re-register itself.

## Login

```ts ignore
// Identifier-first: allowCredentials narrows to the user's passkeys.
const begin = await pact.beginPasskeyLogin('ada@example.dev');

// Usernameless: empty allowCredentials; the browser offers its
// discoverable credentials and pact resolves the user from the
// asserted credential.
const anonymous = await pact.beginPasskeyLogin();

// Finish mints a session through the standard pipeline — the result is
// a PactLoginResult, the `login` event fires with method 'PASSKEY'.
const result = await pact.finishPasskeyLogin(responseJson, { challenge });
```

An unknown identifier is indistinguishable from a user with no
passkeys; a user with passkeys necessarily reveals their credential ids
in `allowCredentials` — the inherent identifier-first tradeoff. Offer
the usernameless form where that matters. The minted session is an ordinary bearer token: the middleware,
refresh, and logout all apply unchanged.

## Verification and failure semantics

Every ceremony verifies the full checklist: clientData type, challenge,
and origin; `rpIdHash` against the configured `rpId`; user presence, and
user verification when `'REQUIRED'`; the assertion signature against the
stored public key (ES256 and RS256).

| Path                                  | Failure                                                                                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `finishPasskeyLogin`                  | `INVALID_CREDENTIALS` — collapsed: unknown credential, origin or challenge mismatch, bad signature, and suspected clones are identical outward |
| `finishPasskeyRegistration`           | `PASSKEY_REGISTRATION_FAILED` with a diagnostic `reason`                                                                                       |
| Ceremonies without `options.passkeys` | `INVALID_OPTION`                                                                                                                               |
| Missing passkey hooks                 | `MISSING_HOOK`, thrown at construction (the five hooks above)                                                                                  |
| No session store at login             | `MISSING_HOOK` from `finishPasskeyLogin` — a session store is a login-time need, not construction-checked                                      |

## Clone detection

A signature counter at or below the stored value (both non-zero) is the
cloned-authenticator signal: the login fails as `INVALID_CREDENTIALS`
and `passkeyCloneSuspected(credentialId, userId)` fires server-side —
the place to alert or force re-enrollment. Synced passkeys (iCloud,
Google Password Manager) report 0 forever and skip the check, per spec.

Two operational notes. An authenticator that reports the same non-zero
counter at registration and its first assertion is treated as a clone on
first use — spec-correct, and rare in practice. And the counter check
races: two assertions read-verify-write concurrently can both pass, so
have `updatePasskeyCounter` reject non-monotonic writes
(`UPDATE ... WHERE sign_count < ?` — see [Storage](Pact-Storage.md)) if
clone detection matters to your deployment.

## Scope

Attestation runs under policy `'none'`: the attestation statement is
parsed but certificate chains are not verified, which is the standard
posture unless you allowlist device models. Full attestation and
Ed25519 credentials are on the [roadmap](Pact-Roadmap.md); passkey
management (listing and deleting a user's credentials) is app UI over
your own storage.

---

[← Back to Pact](../README.md)
