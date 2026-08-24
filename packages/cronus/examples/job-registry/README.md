# Job registry — the Cronus example

A single runnable script covering the scheduler's whole surface without
waiting on a real clock: registration, `enable()`/`disable()`/
`isRunning()`, `start()`/`stop()`/`active`, `trigger()`-based manual
firing, the per-job overlap guard, and a schedule-syntax footgun. Every
line printed is produced by the real `@tundralibs/cronus` exports —
nothing is asserted, only logged, so the output is the proof.

| File      | Shows                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts` | Job registration, `enable`/`disable`/`isRunning`, `start`/`stop`/`active`, `trigger()` (incl. on a disabled job), the overlap guard, and the `'*,5'` vs `'5,*'` star-flag footgun |

Run it on any runtime:

```bash
# Deno
deno run --allow-all packages/cronus/examples/job-registry/main.ts

# Bun
bun run packages/cronus/examples/job-registry/main.ts

# Node (requires tsx for inline TS)
node --import tsx packages/cronus/examples/job-registry/main.ts
```

Output is identical across all three runtimes (no wall-clock waits — the
ticker is started and stopped before any real minute boundary, and every
job firing is driven by `trigger()` or by calling the pure schedule
functions directly).

See [`../../docs/Cronus-Jobs.md`](../../docs/Cronus-Jobs.md) for the job
lifecycle/overlap-guard/event concepts and
[`../../docs/Cronus-Schedule-Syntax.md`](../../docs/Cronus-Schedule-Syntax.md)
for the cron-syntax rules (including the star-flag footgun) this script
walks through.
