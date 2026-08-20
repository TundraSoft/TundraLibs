// oak + PARITY MIDDLEWARE — the same per-request features rapid ships:
// a ULID request id (same @tundralibs/id impl), echoed on the response,
// and (MODE=full) the request wrapped in the same @tundralibs/ambient
// ALS scope rapid uses for log correlation. MODE=id skips the ALS wrap
// so the ULID's own cost is isolated. Same two routes as oak-server.ts.
import { Application, Router } from "jsr:@oak/oak@^17";
import { ulid } from "../../id/mod.ts";
import { ambient } from "../../ambient/mod.ts";

const mode = Deno.env.get("MODE") ?? "full"; // 'id' | 'full'
const port = Number(Deno.env.get("PORT") ?? "4012");
let counter = 0;

const router = new Router();
router.get("/", (ctx) => {
  ctx.response.body = { ok: true };
});
router.get("/users/:id", (ctx) => {
  ctx.response.body = { id: ctx.params.id };
});

const app = new Application();
app.use(async (ctx, next) => {
  const id = ctx.request.headers.get("x-request-id") ??
    (mode === "idcheap" ? "req-" + (++counter) : ulid());
  ctx.response.headers.set("x-request-id", id);
  if (mode === "full") {
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
