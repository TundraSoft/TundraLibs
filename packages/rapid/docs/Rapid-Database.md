# Database access & connection pooling — best practices

How to share a database connection pool across a rAPId app (modules **and**
middleware), with **or without** Norm, and how to stay safe under concurrency
and pool limits.

> Snippets are illustrative (they reference your app's own files/entities), so
> they're tagged `ts ignore`; the APIs shown are the real `@tundralibs/drivers`,
> `@tundralibs/norm`, and `@tundralibs/doctor` surfaces.

---

## TL;DR

- **One engine = one pool. Create it ONCE, `stock` it (doctor), `inject` it
  everywhere.** Never make a pool per request or per module.
- **Reads / normal ops → per-query checkout** (the default): `acquire → run →
  release`, a millisecond hold. A small pool serves huge request concurrency.
- **Atomic writes → a transaction callback**, which pins **one** connection for
  the whole callback. Keep it tight; it's the only long hold and the only
  exhaustion risk.
- **Size `max` to the DB, set a short `acquireTimeoutSeconds`, never pin a
  connection for a whole request, and keep hot lookups (auth secrets) off the
  pool.**

---

## The mental model

The pool lives in the **drivers engine** (Norm wraps one). It holds up to `max`
connections. Two hold patterns:

| Pattern                                 | Hold                                  | Concurrency effect                                    |
| --------------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| **per-query** (`execute` / `repo.find`) | acquire → run → **release** (ms)      | `max` connections serve **≫ max** concurrent requests |
| **transaction** (`transaction(fn)`)     | **one connection for the whole `fn`** | max concurrent transactions **≤ `max`**               |

When all `max` are busy, further `acquire()`s **queue** up to
`acquireTimeoutSeconds`, then reject with a timeout. That queue is
**backpressure** — it throttles DB load to `max`, which protects the DB. Fast
queries keep the queue draining; a held transaction with slow work inside is
what stalls it.

Pool defaults (`EnginePoolOptions`): `min: 0`, `max: 10`,
`idleTimeoutSeconds: 180`, `acquireTimeoutSeconds: 30` (`0` = wait forever).

---

## Path A — with Norm (schema + repos)

### 1. Create once — pool config lives in the engine config

```ts ignore
import { Norm } from '@tundralibs/norm';
import { App } from './schema.ts'; // your Schema()/Entity() definitions

export const norm = new Norm({
  database: {
    dialect: 'postgres',
    host: '...',
    database: 'app',
    username: 'app',
    password: '...',
    pool: {
      min: 2,
      max: 15, // ← the real lever (see "Concurrency & pool limits")
      idleTimeoutSeconds: 180,
      acquireTimeoutSeconds: 5, // fail fast under overload, don't hang
    },
  },
});

export const db = norm.use(App); // a scoped NormDb — SAME pool underneath
```

### 2. Stock once, inject everywhere (doctor)

```ts ignore
// di.ts
import { Doctor, label } from '@tundralibs/doctor';
import { db } from './db.ts';

export const DB = label<typeof db>('DB');
export const registerDb = () => Doctor.stock(DB, db); // call BEFORE app.modules()
```

```ts ignore
// boot: order matters — inject() fires during module construction
await registerDb();
app.modules(Modules); // now every inject(DB) resolves to the one shared db
```

### 3. Use per-query by default (best for concurrency)

```ts ignore
class PostsModule extends BlogModule {
  private readonly db = inject(DB); // shared instance → shared pool

  // each call is a short acquire → query → release
  list() {
    return this.db.repo('Posts').find({ '@published': true });
  }
}
```

### 4. Transactions — only for atomic units, and keep them tight

```ts ignore
// tx pins ONE connection for the whole callback → commit on resolve,
// rollback on throw; a nested tx.transaction() opens a SAVEPOINT.
await db.transaction(async (tx) => {
  const order = await tx.repo('Orders').insert({ userId, total });
  await tx.repo('LineItems').insert(
    lines.map((l) => ({ ...l, orderId: order.id })),
  );
  // ⛔ NO http calls / sleeps / external I/O in here — you are holding a connection
});
```

---

## Path B — without Norm (drivers engine directly)

Same shape: create once, stock, inject, per-query by default, tight
transactions. You just talk to the engine.

### 1. Create once

```ts ignore
import { PostgresEngine } from '@tundralibs/drivers/postgres';

export const engine = new PostgresEngine('app', {
  host: 'localhost',
  database: 'app',
  username: 'app',
  password: '...',
  pool: { min: 2, max: 15, idleTimeoutSeconds: 180, acquireTimeoutSeconds: 5 },
});
```

### 2. Stock + inject (identical to Path A)

```ts ignore
import { Doctor, label } from '@tundralibs/doctor';
export const DB = label<typeof engine>('DB');
Doctor.stock(DB, engine); // before app.modules()
// ...anywhere: const engine = inject(DB);
```

### 3. Per-query — `execute` (auto acquire/release, lazy connect)

```ts ignore
const r = await engine.execute({
  sql: 'SELECT id, name FROM users WHERE active = :ac:',
  params: { ac: true },
});
r.data; // typed rows
r.count; // affected rows for DML
```

### 4. Transaction — callback form (auto COMMIT/ROLLBACK, always released)

```ts ignore
await engine.transaction(async (tx) => {
  await tx.execute({
    sql: 'INSERT INTO orders (user_id) VALUES (:u:)',
    params: { u },
  });
  await tx.execute({ sql: 'INSERT INTO line_items (...) VALUES (...)' });
  // nested tx.transaction(fn) → SAVEPOINT
});
// NOTE: statements inside one tx run SERIALLY — Promise.all([tx.execute(a),
// tx.execute(b)]) is refused (one connection, one in-flight statement).
```

---

## Sharing across modules AND middleware

`inject(DB)` works anywhere in a request, not just module fields — rAPId pins
the app's doctor container into the request's ambient scope, so it resolves even
after an `await`. So auth/middleware hit the **same** pool:

```ts ignore
// an HMAC/verify middleware — same shared pool, no second connection
app.use(authenticate({
  verify: async (token, ctx) => {
    const engine = inject(DB); // or close over `db` from boot
    const { keyId, sig, ts } = parseHmac(ctx.headers.get('authorization'));
    const key = await lookupKey(engine, keyId); // ⚠ per-request DB op — cache it
    return key && verifyRequest(pact, key.secret, ctx.request, sig, ts)
      ? { keyId }
      : null;
  },
}));
```

---

## Concurrency & pool limits (the important part)

**Size `max` to the database, not to your request concurrency.**

```
max  ≈  (DB max_connections − headroom)  /  number_of_app_replicas
```

e.g. Postgres `max_connections = 100`, 4 replicas, leave ~20 headroom → `max ≈
20` per replica. A pool of 15–20 with per-query holds absorbs **thousands** of
concurrent requests because each query holds for milliseconds. Do **not** set
`max` to "one per concurrent request" — that's the pooling anti-pattern.

**Set `acquireTimeoutSeconds` short (e.g. 5).** Under overload a starved request
then **fails fast** (map it to `503`) instead of hanging. `0` (wait forever) is
a latency trap.

**Transactions cap write concurrency at `max`.** Because each holds a
connection, `max` concurrent transactions saturate the pool. So:

- No `await` on non-DB work inside a transaction (HTTP, sleeps, locks, other
  services). Do slow work **before** `begin`.
- Scope to the smallest unit; never span a whole request or module chain.
- The engine's tx-timeout auto-rollback is a safety net, not a plan.

**Never pin a connection for a whole request.** "Request-scoped connection" (one
checkout reused for all of a request's queries) looks efficient but holds a
connection for the request lifetime → concurrency caps at `max` _requests_ and
one slow request starves everyone. Per-query checkout wins; only pin when a
request genuinely needs one end-to-end transaction.

**Keep hot lookups off the pool.** A secret/session/config lookup on _every_
request burns a pool slot per request and competes with real work. Cache it
(`@tundralibs/cacher`) or read config-held values.

**Watch the pool.** `engine.poolStats` → `{ total, active, idle, waiting }`.
Sustained `waiting > 0` = pool too small **or** something holds too long
(usually a fat transaction). Fix the hold first, then the size. Wire it to
`app.metrics`.

---

## Cheat sheet

| Do                                                       | Don't                                          |
| -------------------------------------------------------- | ---------------------------------------------- |
| One engine/Norm, `stock` once, `inject` everywhere       | A pool per request/module                      |
| Per-query (`execute` / `repo.*`) for reads/simple writes | Pin one connection for a whole request         |
| `transaction(fn)` for atomic units, kept tight           | `await` external I/O inside a transaction      |
| `max ≈ DB max / replicas`, short `acquireTimeoutSeconds` | `max` = concurrent-request count; `acquire: 0` |
| Cache hot per-request lookups off the pool               | A DB round-trip per request for auth/config    |
| Monitor `poolStats.waiting`                              | Assume "shared pool" means "safe under load"   |
