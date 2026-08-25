# OAuth 2.0 / OIDC login

The parts of a federated login you can run without a live provider: building the
authorization URL (with its **PKCE `code_challenge`**, CSRF **`state`**, and OIDC
**`nonce`**), and the **first-login account-linking policy** pact hands you. The
code→token exchange talks to the real provider, so it lives in your callback
route — shown as a commented snippet, not executed here.

## Files

| File      | Purpose                                                                |
| --------- | --------------------------------------------------------------------- |
| `main.ts` | Redirect-URL generation + the `createUser` linking policy. Runnable.  |

## Run

```bash
deno run packages/pact/examples/oauth-login/main.ts
bun run  packages/pact/examples/oauth-login/main.ts
node --import tsx packages/pact/examples/oauth-login/main.ts
```

## What to notice

- **`oauthRedirect('google')`** returns the URL plus the `state`, `verifier`,
  and `nonce` you must persist — bound to *this* user's session, single-use.
  They are **not optional**: they are the CSRF, code-interception, and id_token
  replay guards.
- **Linking is your policy.** pact calls `createUser` with the *verified*
  profile on a first federated login; whether that links to an existing account
  or creates one is yours to decide. This example links **only by a
  provider-verified email** — silent linking on an unverified email is an
  account-takeover vector.
- The callback (`login('google', { code, verifier, expectedState, expectedNonce })`)
  exchanges the code, JWKS-verifies the id_token, and mints a session — run it
  in your redirect route against the live provider.
