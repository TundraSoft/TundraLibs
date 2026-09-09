// fastify + PARITY MIDDLEWARE — same features rapid ships per request:
// a request id from the SAME generator rapid defaults to (a shared
// `sequenceID()`, stringified; IDGEN=ulid for a ULID instead) — fastify's
// own req.id is a cheap counter — echoed on the response, and (MODE=full)
// the request wrapped in the same @tundralibs/ambient ALS scope. MODE=id
// isolates the id cost. Run with `node --import tsx`. Same routes as
// fastify-server.mjs.
import Fastify from 'fastify';
import { sequenceID, ulid } from '../../id/mod.ts';
import { ambient } from '../../ambient/mod.ts';

// Cross-runtime env (fastify runs on Node/Bun natively, Deno via node-compat).
const g = globalThis as {
  Deno?: { env: { get(k: string): string | undefined } };
  process?: { env: Record<string, string | undefined> };
};
const genv = (k: string): string | undefined =>
  g.Deno?.env.get(k) ?? g.process?.env?.[k];
const mode = genv('MODE') ?? 'full'; // 'id' | 'full'
const port = Number(genv('PORT') ?? '4014');
// Match rapid's default: ONE shared sequenceID instance, stringified per call.
const seq = sequenceID();
const idgen = genv('IDGEN') ?? 'seq'; // 'seq' (rapid default) | 'ulid'
const mintId = (): string => idgen === 'ulid' ? ulid() : String(seq());
let counter = 0;

const app = Fastify({ logger: false });
app.addHook('onRequest', (req, reply, done) => {
  const id = (req.headers['x-request-id'] as string | undefined) ??
    (mode === 'idcheap' ? 'req-' + (++counter) : mintId());
  reply.header('x-request-id', id);
  if (mode === 'full') {
    ambient.run({ requestId: id, action: req.url }, done);
  } else {
    done();
  }
});
app.get('/', () => ({ ok: true }));
app.get('/users/:id', (req) => ({
  id: (req.params as { id: string }).id,
}));
app.listen({ port }, () => {
  console.log(`fastify-parity (${mode}) listening on ${port}`);
});
