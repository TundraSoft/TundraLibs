/**
 * @fileoverview RadRouter wired into an Express 4/5 application.
 *
 * RadRouter is structurally agnostic — it stores and dispatches
 * middleware functions but never invokes them itself. To plug it
 * into Express, parameterise `RadRouter<M>` with Express's own
 * `(req, res, next)` middleware shape and write one thin adapter
 * that bridges Express's sync-callback model to RadRouter's chain.
 *
 * Run (after `npm install express` in your own project):
 *   tsx packages/radrouter/examples/with-express.ts
 *   curl http://localhost:8080/health
 *   curl http://localhost:8080/users/AbCdEf
 *   curl -X POST http://localhost:8080/users
 *
 * Note: this file imports Express via the `npm:` specifier (works
 * under Deno) — adjust the import line to a bare `from 'express'`
 * if you're running under plain Node/Bun with Express already in
 * your `node_modules`.
 */

// deno-lint-ignore-file no-explicit-any
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'npm:express@^4.21.0';
import { type HTTPMethod, RadRouter } from '../mod.ts';

// Express middleware shape. RadRouter never reads inside `req`/`res`
// — it just stores functions of this type. Errors propagate via
// `next(err)` per Express convention.
type ExpressMw = (req: Request, res: Response, next: NextFunction) => void;

const router = new RadRouter<ExpressMw>({ caseSensitive: false });

// Global timing middleware (router-level — runs before every match).
router.use((req, res, next) => {
  const start = performance.now();
  res.on('finish', () => {
    const ms = performance.now() - start;
    console.log(
      `${req.method} ${req.path} → ${res.statusCode} (${ms.toFixed(2)}ms)`,
    );
  });
  next();
});

router.get('/health', [(_req, res) => {
  res.type('text/plain').send('ok');
}]);

router.get('/users/:id:', [(req, res) => {
  // RadRouter puts captured params on the match object — we stash
  // them onto `req.radParams` in the adapter below so handlers
  // can read them like any other property.
  const id = (req as any).radParams.id as string;
  res.json({ id });
}]);

router.post('/users', [(req, res) => {
  res.status(201).json({ created: true, body: req.body });
}]);

const METHODS: HTTPMethod[] = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
];

// The adapter: one Express middleware that consults RadRouter on
// every request, attaches matched params, and runs the chain. Sits
// at app-level so all RadRouter routes flow through it.
const radHandler: ExpressMw = (req, res, next) => {
  const match = router.find(req.method as HTTPMethod, req.path);

  if (!match) {
    // Probe sibling methods on the same path to distinguish 404 / 405.
    const allowed = METHODS.filter((m) => router.find(m, req.path));
    if (allowed.length) {
      res.set('Allow', allowed.join(', '));
      return res.status(405).send('Method Not Allowed');
    }
    return next(); // pass through to Express's default 404
  }

  (req as any).radParams = match.params;

  let i = 0;
  const run = (err?: unknown) => {
    if (err) return next(err);
    const mw = match.middlewares[i++];
    if (!mw) return next();
    try {
      mw(req, res, run);
    } catch (e) {
      next(e);
    }
  };
  run();
};

const app = express();
app.use(express.json());
app.use(radHandler);

app.listen(8080, () => console.log('listening on http://localhost:8080'));
