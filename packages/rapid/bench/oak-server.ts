// Minimal oak server for benchmarking — same two routes as rapid-server.ts.
import { Application, Router } from 'jsr:@oak/oak@^17';

const router = new Router();
router.get('/', (ctx) => {
  ctx.response.body = { ok: true };
});
router.get('/users/:id', (ctx) => {
  ctx.response.body = { id: ctx.params.id };
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());
app.listen({ port: 4002 });
console.log('oak listening on 4002');
