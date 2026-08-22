// Minimal fastify server for benchmarking — same two routes as rapid-server.ts.
import Fastify from 'fastify';

const app = Fastify({ logger: false });
// Per-request correlation id (parity with rapid) — every real app has one.
app.addHook('onRequest', (_req, reply, done) => {
  reply.header('x-request-id', crypto.randomUUID());
  done();
});
app.get('/', () => ({ ok: true }));
app.get('/users/:id', (req) => ({ id: req.params.id }));
app.listen({ port: 4004 }, () => {
  console.log('fastify listening on 4004');
});
