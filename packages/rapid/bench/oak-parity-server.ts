// oak + PARITY MIDDLEWARE — the same per-request features rapid ships:
// a request id from the SAME generator rapid defaults to (a shared
// `sequenceID()`, stringified; IDGEN=ulid for a ULID instead), echoed on
// the response, and (MODE=full) the request wrapped in the same
// @tundralibs/ambient ALS scope rapid uses for log correlation. MODE=id
// skips the ALS wrap so the id's own cost is isolated. Same two routes as
// oak-server.ts.
import { Application, Router } from '@oak/oak';
import { sequenceID, ulid } from '../../id/mod.ts';
import { ambient } from '../../ambient/mod.ts';

// Cross-runtime env (oak runs on Deno natively, Node/Bun via the npm build).
const g = globalThis as {
  Deno?: { env: { get(k: string): string | undefined } };
  process?: { env: Record<string, string | undefined> };
};
const genv = (k: string): string | undefined =>
  g.Deno?.env.get(k) ?? g.process?.env?.[k];
const mode = genv('MODE') ?? 'full'; // 'id' | 'full'
const port = Number(genv('PORT') ?? '4012');
// Match rapid's default: ONE shared sequenceID instance, stringified per call.
const seq = sequenceID();
const idgen = genv('IDGEN') ?? 'seq'; // 'seq' (rapid default) | 'ulid'
const mintId = (): string => idgen === 'ulid' ? ulid() : String(seq());
let counter = 0;

const router = new Router();
router.get('/', (ctx) => {
  ctx.response.body = { ok: true };
});
router.get('/users/:id', (ctx) => {
  ctx.response.body = { id: ctx.params.id };
});

const app = new Application();
app.use(async (ctx, next) => {
  const id = ctx.request.headers.get('x-request-id') ??
    (mode === 'idcheap' ? 'req-' + (++counter) : mintId());
  ctx.response.headers.set('x-request-id', id);
  if (mode === 'full') {
    await ambient.run(
      { requestId: id, action: ctx.request.url.pathname },
      next,
    );
  } else {
    await next();
  }
});
app.use(router.routes());
app.use(router.allowedMethods());
app.listen({ port });
console.log(`oak-parity (${mode}) listening on ${port}`);
