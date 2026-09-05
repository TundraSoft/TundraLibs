# oauth-signin — "Sign in with Google/GitHub" on pact

A minimal OAuth sign-in API showing pact's OAuth client end to end:
authorization redirect with PKCE + state, callback exchange, profile
normalization, just-in-time user provisioning, and a session minted on
success — plus the shipped oak middleware protecting the API routes.

| File       | Purpose                                                            |
| ---------- | ------------------------------------------------------------------ |
| `main.ts`  | The oak app: pact instance, redirect/callback routes, protected routes |
| `store.ts` | In-memory storage hooks (`getUser`, `createUser` with OAuth links) |

## Configure a provider

The app reads provider credentials from the environment and enables
whatever is configured. With nothing configured it still boots and the
`/` route says so.

| Variable               | Provider |
| ---------------------- | -------- |
| `GOOGLE_CLIENT_ID`     | Google   |
| `GOOGLE_CLIENT_SECRET` | Google   |
| `GITHUB_CLIENT_ID`     | GitHub   |
| `GITHUB_CLIENT_SECRET` | GitHub   |

Register the OAuth app with the provider first:

- **Google**: [console.cloud.google.com](https://console.cloud.google.com)
  → APIs & Services → Credentials → Create OAuth client ID (Web
  application). Authorized redirect URI:
  `http://localhost:8735/auth/google/callback`.
- **GitHub**: [github.com/settings/developers](https://github.com/settings/developers)
  → New OAuth App. Authorization callback URL:
  `http://localhost:8735/auth/github/callback`.

`PORT` overrides the default `8735`; the registered redirect URI must
match the port you run on.

## Run

```bash
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... deno run -A main.ts
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... bun main.ts
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node --import tsx main.ts
```

## Walk through it

1. Open `http://localhost:8735/auth/google` in a browser. You are
   redirected to the provider's consent screen; approving lands you back
   on the callback, which answers with a session token and your profile
   (a real app would set a cookie instead):

   ```json
   { "token": "pact_st_...", "expiresAt": "...", "user": { "id": "u1", "name": "Ada" } }
   ```

   The first sign-in provisions the user (`createUser` with the OAuth
   link); later sign-ins resolve the same user through the link.

2. Call the API with the token:

   ```bash
   curl -H 'Authorization: Bearer pact_st_...' http://localhost:8735/me
   curl -H 'Authorization: Bearer pact_st_...' http://localhost:8735/notes
   ```

   `/me` is behind `oakAuth` (401 without a valid token); `/notes` adds
   `oakGuard('Notes', 'READ')` (403 without the permission).

Sessions here are cache-only (`cache: { ttl: { session: 60 } }`, MEMORY
engine): pact's session cache is the store, so the demo needs no session
hooks and forgets everything on restart.
