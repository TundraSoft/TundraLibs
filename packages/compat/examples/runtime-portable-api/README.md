# runtime-portable-api

A tiny HTTP service that runs **unmodified on Deno, Bun, and Node** because it
goes through `@tundralibs/compat` instead of any runtime-only global
(`Deno.serve`, `Bun.serve`, `node:http`). That portability is the whole reason
`compat` exists — this example makes it concrete: start a server, drive a few
`fetch()` calls through its routes, and get byte-identical output on all three
runtimes.

It exercises four `compat` modules together, which is more than an inline
snippet can show coherently:

- **`webserver`** — the cross-runtime `WebServer` (TCP, ephemeral port).
- **`http`** — `negotiate` (content negotiation), `STATUS_TEXT` (reason
  phrases), `contentTypeFor` (extension → `Content-Type`).
- **`file`** — `readTextFile` to serve a static asset.
- **`runtime`** — `detectRuntime` / `isWorkers` / `isBrowser` for graceful
  degradation.

## Supported runtimes

**Deno, Bun, and Node only — not Cloudflare Workers or the browser.** A
`WebServer` needs a listening TCP socket, which neither Workers nor a browser
can bind, so `start()` there throws `UnsupportedRuntimeError` by design.
`main.ts` detects those targets up front (`isWorkers` / `isBrowser`) and exits
with a clear message rather than failing deep inside `start()` — the same
"detect and degrade gracefully" pattern the package's golden rule prescribes.

## Files

| File                  | Purpose                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`             | Entrypoint. Detects the runtime, starts the server on an ephemeral port, runs the `fetch` scenarios, prints results, stops. |
| `server.ts`           | `createServer(staticDir)` — builds the `WebServer` (TCP, `port: 0`, localhost) and wires the router.                        |
| `routes.ts`           | `createRouter(staticDir)` — the request handler: `/health` (negotiated), `/greeting.txt` (static file), `404` fallback.     |
| `public/greeting.txt` | The static asset served by `GET /greeting.txt`.                                                                             |

## Run it

From the repository root (each command starts the server, runs the scenarios,
and exits on its own):

```bash
# Deno
deno run --allow-all packages/compat/examples/runtime-portable-api/main.ts

# Bun
bun run packages/compat/examples/runtime-portable-api/main.ts

# Node (via tsx, already a repo devDependency)
node --import tsx packages/compat/examples/runtime-portable-api/main.ts
```

Copied into your own project after `deno add`/`bunx jsr add`/`npx jsr add
@tundralibs/compat`, the imports resolve unchanged — only the path to
`main.ts` shortens.

## Expected output

Identical on every runtime except the first line (the detected runtime):

```text
Detected runtime: DENO
Server started; running route scenarios:

GET /health       Accept: application/json  -> 200 OK             [application/json]          {"status":"ok"}
GET /health       Accept: text/plain        -> 200 OK             [text/plain]                ok
GET /health       Accept: image/png         -> 406 Not Acceptable [text/plain]                Not Acceptable
GET /greeting.txt Accept: */*               -> 200 OK             [text/plain; charset=UTF-8] Hello from a static file, served through @tundralibs/compat/file.
GET /nope         Accept: */*               -> 404 Not Found      [text/plain]                Not Found

Server stopped cleanly.
```

`GET /health` shows `negotiate` picking JSON, plain text, or `406` when the
client accepts neither. `GET /greeting.txt` shows a file read typed by
`contentTypeFor`. Every status line's reason phrase comes from `STATUS_TEXT`.

To prove portability, diff the runs (only the `Detected runtime:` line should
differ):

```bash
M=packages/compat/examples/runtime-portable-api/main.ts
diff <(deno run --allow-all "$M") <(bun run "$M")
diff <(deno run --allow-all "$M") <(node --import tsx "$M")
```

## Deep dives

- WebServer — [`Compat-WebServer.md`](../../webserver/Compat-WebServer.md)
- HTTP helpers (`negotiate` / `STATUS_TEXT` / `contentTypeFor`, plus cookies
  and ranges this example doesn't use) — [`Compat-Http.md`](../../docs/Compat-Http.md)
- Runtime detection — [`Compat-Runtime.md`](../../docs/Compat-Runtime.md)
- File operations — [`Compat-File.md`](../../docs/Compat-File.md)

---

[← Back to Compat](../../README.md)
