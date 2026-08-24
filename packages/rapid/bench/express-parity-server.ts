// express + PARITY MIDDLEWARE — same features rapid ships per request:
// a request id from the SAME generator rapid defaults to (a shared
// `sequenceID()`, stringified; IDGEN=ulid for a ULID instead), echoed on
// the response, and (MODE=full) the request wrapped in the same
// @tundralibs/ambient ALS scope. MODE=id isolates the id cost. Run with
// `node --import tsx` (it imports workspace TS). Same routes as
// express-server.mjs.
import express from "express";
import { sequenceID, ulid } from "../../id/mod.ts";
import { ambient } from "../../ambient/mod.ts";

// Cross-runtime env (express runs on Node/Bun natively, Deno via node-compat).
const g = globalThis as {
  Deno?: { env: { get(k: string): string | undefined } };
  process?: { env: Record<string, string | undefined> };
};
const genv = (k: string): string | undefined =>
  g.Deno?.env.get(k) ?? g.process?.env?.[k];
const mode = genv("MODE") ?? "full"; // 'id' | 'full'
const port = Number(genv("PORT") ?? "4013");
// Match rapid's default: ONE shared sequenceID instance, stringified per call.
const seq = sequenceID();
const idgen = genv("IDGEN") ?? "seq"; // 'seq' (rapid default) | 'ulid'
const mintId = (): string => idgen === "ulid" ? ulid() : String(seq());
let counter = 0;

const app = express();
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const id = (req.headers["x-request-id"] as string | undefined) ??
      (mode === "idcheap" ? "req-" + (++counter) : mintId());
    res.setHeader("x-request-id", id);
    if (mode === "full") {
      ambient.run({ requestId: id, action: req.path }, () => next());
    } else {
      next();
    }
  },
);
app.get("/", (_req, res) => {
  res.json({ ok: true });
});
app.get("/users/:id", (req, res) => {
  res.json({ id: req.params.id });
});
app.listen(port, () => {
  console.log(`express-parity (${mode}) listening on ${port}`);
});
