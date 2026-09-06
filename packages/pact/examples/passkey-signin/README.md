# passkey-signin — passwordless auth with passkeys

Sign up and sign in with a passkey, end to end in a real browser:
registration ceremony, identifier-first and usernameless (discoverable)
login, the minted session used as an ordinary bearer token through the
shipped oak middleware. The page is vanilla JS on the WebAuthn JSON
APIs — no client library.

| File       | Purpose                                                        |
| ---------- | -------------------------------------------------------------- |
| `main.ts`  | The oak app: pact instance, ceremony routes, demo page, guarded `/me` |
| `store.ts` | In-memory hooks: passwordless users plus the four passkey hooks |

## Run

```bash
deno run -A main.ts
bun main.ts
node --import tsx main.ts
```

Open `http://localhost:8736` in a browser with a passkey-capable
authenticator (Touch ID, Windows Hello, an Android/iOS phone, or a
security key). `localhost` counts as a secure context, so plain http
works for the demo.

## Walk through it

1. **Sign up** — enter a username and create the account plus its first
   passkey in one step: the server answers with
   `PublicKeyCredentialCreationOptions` JSON, the page calls
   `navigator.credentials.create`, and the result goes back for
   verification and storage.
2. **Sign in** — with the username filled in, the server lists that
   user's credentials in `allowCredentials`; left empty, the browser
   offers its discoverable credentials and the server resolves the user
   from the asserted credential. Either way a session token comes back.
3. **Call the API** — `GET /me` goes through `oakAuth` with the session
   token; from here on a passkey login is indistinguishable from any
   other pact session.

The challenge between begin and finish is stashed server-side and
single-use; replaying one answers `UNKNOWN_CHALLENGE`. Everything is
in-memory: restart and the users, passkeys, and sessions are gone.
