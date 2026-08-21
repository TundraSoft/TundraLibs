// Minimal rAPId server for benchmarking — plain function API (no
// decorators/modules, no middleware) to measure the framework's own
// baseline overhead, not example-app logic. Runs identically under
// `deno run` and `node --import tsx` (same file, no changes) — the
// cross-runtime story is itself part of what's being measured.
import { Application } from '../Application.ts';

const app = new Application({
  name: 'bench',
  mode: 'PRODUCTION',
  server: { port: 4001 },
});
app.get('/', () => ({ content: { ok: true } }));
app.get('/users/:id:', (ctx) => ({
  content: { id: ctx.args.params.id },
}));
await app.start();
console.log(`rapid listening on ${app.port}`);
