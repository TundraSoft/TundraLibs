# Password login + TOTP second factor

A password login as the **first factor**, then **TOTP as a plain second
factor** — enroll a seed, generate the current code with crypt, and verify it.
Backed by an **in-memory store**. Pact treats MFA as *secondary verification*,
not a login state machine: the seed lives on the stored user and your app
decides when to demand the second step after `login()`.

## Files

| File      | Purpose                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `main.ts` | Register → password login → enroll TOTP → verify, with `Map`-backed hooks. Runnable as-is. |

## Run

```bash
deno run packages/pact/examples/totp-mfa/main.ts
bun run  packages/pact/examples/totp-mfa/main.ts
node --import tsx packages/pact/examples/totp-mfa/main.ts
```

## What to notice

- **MFA is not a login state machine.** `login('password', …)` is the first
  factor; `verifyOtp()` is a separate, pure yes/no check the app runs
  afterward. Pact never tracks a "half-logged-in" state.
- **`enrollOtp` persists the seed via `updateUser({ otpSecret })`** and returns
  the seed plus an `otpauth://` URL you would render as a QR code. The
  `updateUser` hook must **merge** the patch into the stored record.
- **The TOTP seed is a bearer secret.** Anyone who can read `otpSecret` can mint
  valid codes, so in production encrypt it at rest and keep it out of the
  `getUser({ by: 'ID' })` path used purely to build a principal. This example
  uses one store for both, for brevity.
- **`generateTOTP(seed)` (from `@tundralibs/crypt/OTP`) mirrors the
  authenticator app** — crypt is a real dependency of pact, and both sides
  interpret the seed identically, so the code verifies.
- **`verifyOtp` returns `false`, never a throw**, for a wrong code or a
  missing / unenrolled / non-`ACTIVE` user.
- The `secret` is an inline literal for the demo only — in production load it
  from an env var or secret manager, and keep it ≥ 32 bytes for HS256.
