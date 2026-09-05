# orbit — a full pact integration on oak

A small project-management API exercising the whole pact surface over real
HTTP: registration and activation, password login with JWT sessions and
refresh rotation, logout and logout-all, password reset, API keys, HMAC
request signatures, TOTP MFA, OAuth configuration, per-route authorization
through bound principals, and the audit-trail events.

| File       | Purpose                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `main.ts`  | The oak app: pact instance (JWT strategy), error boundary, auth guard, all routes |
| `store.ts` | In-memory hooks with real encrypt-at-rest for API-key secrets and MFA seeds |

## Run

```bash
deno run -A main.ts
bun main.ts
node --import tsx main.ts
```

The app listens on `http://localhost:8734`.

## Walk through it

```bash
# Register (PENDING) and activate:
curl -s -X POST localhost:8734/register \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.dev","password":"correct-horse-9"}'
curl -s -X POST localhost:8734/activate \
  -H 'content-type: application/json' -d '{"userId":"<id>"}'

# Login → access + refresh tokens (JWT strategy):
curl -s -X POST localhost:8734/login \
  -H 'content-type: application/json' \
  -d '{"email":"ada@example.dev","password":"correct-horse-9"}'

# Who am I, what may I do (bound-principal permission map):
curl -s localhost:8734/me -H 'Authorization: Bearer <token>'

# Rotate the session without re-authenticating:
curl -s -X POST localhost:8734/refresh \
  -H 'content-type: application/json' -d '{"refreshToken":"<rt>"}'

# Permission-gated resources (403 without the grant):
curl -s localhost:8734/projects -H 'Authorization: Bearer <token>'
curl -s localhost:8734/billing -H 'Authorization: Bearer <token>'

# API keys: issue, then authenticate with ApiKey or an HMAC signature:
curl -s -X POST localhost:8734/keys -H 'Authorization: Bearer <token>'
curl -s localhost:8734/projects -H 'Authorization: ApiKey <key>:<secret>'

# The audit trail (pact events, captured by listeners):
curl -s localhost:8734/audit -H 'Authorization: Bearer <token>'
```

Routes also cover `PATCH /users/:id/grants` (grants write +
`invalidatePrincipal`), `POST /password` / `/password-reset` /
`/password-reset/complete`, `POST /logout` / `/logout-all`,
`DELETE /keys/:id`, `POST /mfa/enroll` / `/mfa/verify`, and
`GET /auth/google` (OAuth redirect wiring; supply real client credentials
in `main.ts` to complete the loop — or see the
[oauth-signin](../oauth-signin/README.md) example, which does exactly that).
