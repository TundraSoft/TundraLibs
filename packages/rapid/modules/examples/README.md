# Module system — standalone POC

A "fairly complicated app" with **no HTTP** — the module system on its own.

```bash
deno run -A packages/rapid/modules/examples/main.ts      # narrated walkthrough
deno test -A packages/rapid/modules/                     # core + example tests
```

| file                       | shows                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| `services/*`               | `@Vial` singletons doctor builds on demand — the things modules **call directly**                   |
| `middleware.ts`            | invoke-time guards reading the **caller's** principal off `ctx.state`                               |
| `AppModule.ts`             | the app's base: `RapidModule` + injected services (abstract, **not** in the barrel)                 |
| `modules/Users.ts`         | fire-and-forget `emit`; `@Use` guards that only bite through `invoke`                               |
| `modules/Posts.ts`         | all three channels: plain call · event (fire-and-forget **and** awaited) · guarded methods          |
| `modules/Comments.ts`      | **delegation via `invoke`** — honoring another module's guard against the caller's principal        |
| `modules/Notifications.ts` | subscriber-only module; typed payloads via `import type`; a deliberately failing handler (isolated) |
| `modules/Audit.ts`         | multi-event `@On`; correlation ids; `@Vial` module (single-instance rule); `init`/`dispose`         |
| `modules/Search.ts`        | index from events; **module → module** direct dependency (safe: doctor-held instance)               |
| `modules/mod.ts`           | the hand-written barrel — the one input `initModules` takes (typed, Workers-safe)                   |
| `testing.ts` + `*.test.ts` | the standard test shape: fresh services (`revoke` + `prescribe`), fake Mailer via `stock`           |

Rules the example embodies: `namespace:Module:EventName` names · events declared **on the publisher** · an
event carries **correlation only, never authority** (auth ⇒ `invoke`, not an event) · plain calls run no
middleware · `stock` the async roots, `@Vial` everything downstream.
