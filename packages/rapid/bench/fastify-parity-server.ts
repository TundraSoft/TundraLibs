// fastify + PARITY MIDDLEWARE — same features rapid ships per request:
// ULID request id (same @tundralibs/id impl; fastify's default req.id is
// a cheap counter, so this is the sortable-id feature match), echoed on
// the response, and (MODE=full) the request wrapped in the same
// @tundralibs/ambient ALS scope. MODE=id isolates the ULID cost. Run
// with `node --import tsx`. Same routes as fastify-server.mjs.
import Fastify from 'fastify';
import { ulid } from '../../id/mod.ts';
import { ambient } from '../../ambient/mod.ts';

const mode = process.env.MODE ?? 'full'; // 'id' | 'full'
const port = Number(process.env.PORT ?? '4014');
let counter = 0;

const app = Fastify({ logger: false });
app.addHook('onRequest', (req, reply, done) => {
  const id = (req.headers['x-request-id'] as string | undefined) ??
    (mode === 'idcheap' ? 'req-' + (++counter) : ulid());
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
