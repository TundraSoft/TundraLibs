/**
 * The modules-tier rAPId example: decorated CLASSES mounted via
 * `app.module()` — the counterpart to `main.ts` (which shows the
 * plain function-registration surface). Same config-driven boot, same
 * middleware engine underneath; the only difference is HOW routes get
 * declared. Shows `@Module`'s name/prefix/namespace/version, one class
 * handling THREE transports (HTTP + SOCKET + JOB), every binder
 * source, a class with no `@Module` at all (opt-in), and that rAPId
 * never constructs anything — `UserStore` is built and injected by
 * THIS file, not by the framework.
 *
 * Run (from the repo root):
 *
 * ```bash
 * GREETING_SOURCE=the-env deno run --allow-net --allow-read --allow-env \
 *   --allow-sys --allow-write packages/rapid/examples/modules.ts
 * ```
 *
 * Try it:
 *
 * ```bash
 * curl -s localhost:3000/health                                  # a class with NO @Module — still mounts
 * curl -s localhost:3000/users/ | jq                              # query()+paging() binders
 * curl -s localhost:3000/users/1                                  # param() binder
 * curl -s localhost:3000/users/1 -H 'x-trace: abc'                # header() binder
 * curl -s localhost:3000/users/1 -H 'x-api-version: v1'           # find() is versioned...
 * curl -si localhost:3000/users/1 -H 'x-api-version: v2'          # ...so an unregistered version 404s
 * curl -si localhost:3000/users/1                                 # ...and so does no header — no default configured
 * curl -si localhost:3000/users/9                                 # 404 RAPID_NOT_FOUND
 * curl -s -X POST localhost:3000/users/ -H 'content-type: application/json' \
 *   -d '{"name":"Alan Turing"}' | jq                              # payload() binder
 * curl -si -X POST localhost:3000/users/ -d '{}'                  # 400 RAPID_VALIDATION_FAILED
 * ```
 *
 * Websocket (same port, rpc protocol on /ws — e.g. `@tundralibs/rpc`):
 *
 * ```typescript
 * const ws = new Client({ url: 'ws://localhost:3000/ws' });
 * await ws.connect();
 * // @Module's namespace ("users") joins onto the bare @SOCKET('get')
 * // command declared on the class — the flat-namespace equivalent of
 * // @Module's HTTP prefix.
 * await ws.command('users.get', { id: '1' }); // connection() binder in the reply
 * ```
 *
 * `users.sync` (the namespaced form of the bare `@JOB('sync')` below)
 * is a real cron job (`0 * * * *`) — see `main.ts` for how to trigger
 * a job on demand outside its schedule
 * (`app.triggerJob(name, argsOverride)`).
 */

import { rapid } from '../mod.ts';
import { RapidError } from '../errors/mod.ts';
import {
  connection,
  GET,
  header,
  JOB,
  Module,
  paging,
  param,
  payload,
  POST,
  query,
  SOCKET,
} from '../decorators/mod.ts';
import type { SOCKETConnection } from '../context/mod.ts';
import type {
  RapidContextPaging,
  RapidContextQuery,
  RapidContextResponse,
} from '../types/mod.ts';

type UserRow = { id: string; name: string };

/**
 * A trivial in-memory store. Module DEPENDENCIES are not rAPId's
 * business — this could just as easily be a DI container's product;
 * rAPId only ever sees the `Users` instance below, never this class.
 */
class UserStore {
  #rows = new Map<string, UserRow>([
    ['1', { id: '1', name: 'Ada Lovelace' }],
    ['2', { id: '2', name: 'Grace Hopper' }],
  ]);

  list(): UserRow[] {
    return [...this.#rows.values()];
  }

  find(id: string): UserRow | undefined {
    return this.#rows.get(id);
  }

  create(name: string): UserRow {
    const row: UserRow = { id: String(this.#rows.size + 1), name };
    this.#rows.set(row.id, row);
    return row;
  }
}

// ── @Module: `prefix` joins onto HTTP paths only — /users/:id: below
//    is reachable at "/users/:id:". `namespace` does the equivalent
//    job for SOCKET/JOB, which are otherwise FLAT namespaces: `get`/
//    `sync` below become "users.get"/"users.sync" on the wire, without
//    the class hand-prefixing its own command/job strings. ──────────
@Module('Users', { namespace: 'users', prefix: '/users' })
class Users {
  // rAPId never calls `new` — YOU built this instance (see boot,
  // below), by hand or via a container; the framework only binds it.
  constructor(private readonly store: UserStore) {}

  @GET('/', { bind: [query(), paging()] })
  list(
    _query: RapidContextQuery,
    paging: RapidContextPaging,
  ): RapidContextResponse {
    // This toy store ignores filters/sorting — a real one would read
    // `_query.filters`/`_query.sorting` to build its lookup.
    return { content: { rows: this.store.list(), paging } };
  }

  @GET('/:id:', {
    bind: [param('id'), header('x-trace')],
    version: 'v1',
    description: 'Fetch one user by id.',
  })
  find(id: string, trace: string | null): RapidContextResponse {
    const row = this.store.find(id);
    if (row === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return { content: { ...row, trace } };
  }

  @POST('/', { bind: [payload()] })
  create(body: unknown): RapidContextResponse {
    const name = (body as { name?: unknown } | undefined)?.name;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new RapidError('RAPID_VALIDATION_FAILED', {
        details: { field: 'name' },
      });
    }
    return { status: 201, content: this.store.create(name) };
  }

  // Same store, a DIFFERENT transport — one implementation, another
  // entry point. `connection()` is SOCKET-only; binding it on @GET/@JOB
  // is rejected at MOUNT time (see Application.module.test.ts).
  @SOCKET('get', { bind: [param('id'), connection()] })
  findViaSocket(id: string, conn: SOCKETConnection): RapidContextResponse {
    const row = this.store.find(id);
    return row === undefined
      ? { status: 404, content: { error: 'not found' } }
      : { content: { ...row, connectionId: conn.id } };
  }

  // Registration-default `args` flow through a param() binder exactly
  // like an inbound request param would — the job/HTTP/socket uniform
  // args contract, from `main.ts`'s `daily-report`, holds here too.
  @JOB('sync', '0 * * * *', {
    args: { source: 'scheduled' },
    bind: [param('source')],
  })
  sync(source: string): RapidContextResponse {
    return { content: { synced: this.store.list().length, source } };
  }
}

// ── a class with NO @Module at all — still mountable, opt-in only
//    buys a prefix. `app.module()` doesn't require ceremony. ────────
class Health {
  @GET('/health')
  check(): RapidContextResponse {
    return { content: { ok: true } };
  }
}

// ── boot: same config-driven shape as main.ts ────────────────────────
const configDir = new URL('./configs', import.meta.url).pathname;
const app = await rapid(configDir, {});

// app.module(a, b, ...) — several decorated instances in one call.
app.module(new Users(new UserStore()), new Health());

await app.start();
app.log.info(`try: curl -s localhost:${app.port}/users/1`);
