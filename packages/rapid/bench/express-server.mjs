// Minimal express server for benchmarking — same two routes as rapid-server.ts.
import express from 'express';

const app = express();
// Per-request correlation id (parity with rapid) — every real app has one.
app.use((_req, res, next) => {
  res.setHeader('x-request-id', crypto.randomUUID());
  next();
});
app.get('/', (_req, res) => {
  res.json({ ok: true });
});
app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id });
});
app.listen(4003, () => {
  console.log('express listening on 4003');
});
