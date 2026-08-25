# pact examples

Runnable, self-contained mini-apps — each backed by in-memory `Map`s (swap the
`hooks` for your database) and verified on Deno, Bun, and Node. Every folder has
a `main.ts` and its own README with the exact run commands.

| Example                                | Shows                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------- |
| [password-jwt](password-jwt/)          | The core flow — register → login → verify → authorize → refresh → logout    |
| [opaque-sessions](opaque-sessions/)    | Store-backed `OPAQUE` sessions with **instant** revocation (`logout`/`logoutAll`) |
| [api-keys](api-keys/)                  | Issue API keys, the `APIKEY` scheme, scoped grants, revocation              |
| [hmac-signing](hmac-signing/)          | Inbound `HMAC` request signatures + outbound `sign()`/`verifySignature()`   |
| [simple-tokens](simple-tokens/)        | Opaque static bearer tokens (`TOKEN`) — issue, expiry, revoke               |
| [rbac-authz](rbac-authz/)              | The dependency-free `./authz` bitmask kernel (no engine, no crypto)         |
| [totp-mfa](totp-mfa/)                  | Password login + TOTP as a plain second factor                             |
| [custom-strategy](custom-strategy/)    | The `strategies` escape hatch (a mock single-use magic link)                |
| [oauth-login](oauth-login/)            | OAuth redirect URL (PKCE/state/nonce) + the first-login linking policy      |

Run any example straight from the repo root, e.g.:

```bash
deno run packages/pact/examples/password-jwt/main.ts
bun run  packages/pact/examples/password-jwt/main.ts
node --import tsx packages/pact/examples/password-jwt/main.ts
```
