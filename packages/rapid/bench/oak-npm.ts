// oak server for Node/Bun (bare '@oak/oak' from node_modules). Same routes +
// per-request correlation id as the others.
import { Application, Router } from '@oak/oak';

const router = new Router();
router.get('/', (ctx) => {
  ctx.response.body = { ok: true };
});
router.get('/users/:id', (ctx) => {
  ctx.response.body = { id: ctx.params.id };
});

const app = new Application();
app.use(async (ctx, next) => {
  ctx.response.headers.set('x-request-id', crypto.randomUUID());
  await next();
});
app.use(router.routes());
app.use(router.allowedMethods());
app.listen({ port: 4002 });
console.log('oak listening on 4002');
