// express + PARITY MIDDLEWARE — same features rapid ships per request:
// ULID request id (same @tundralibs/id impl), echoed on the response,
// and (MODE=full) the request wrapped in the same @tundralibs/ambient
// ALS scope. MODE=id isolates the ULID cost. Run with
// `node --import tsx` (it imports workspace TS). Same routes as
// express-server.mjs.
import express from 'express';
import { ulid } from '../../id/mod.ts';
import { ambient } from '../../ambient/mod.ts';

const mode = process.env.MODE ?? 'full'; // 'id' | 'full'
const port = Number(process.env.PORT ?? '4013');
let counter = 0;

const app = express();
app.use(
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const id = (req.headers['x-request-id'] as string | undefined) ??
      (mode === 'idcheap' ? 'req-' + (++counter) : ulid());
    res.setHeader('x-request-id', id);
    if (mode === 'full') {
      ambient.run({ requestId: id, action: req.path }, () => next());
    } else {
      next();
    }
  },
);
app.get('/', (_req, res) => {
  res.json({ ok: true });
});
app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id });
});
app.listen(port, () => {
  console.log(`express-parity (${mode}) listening on ${port}`);
});
