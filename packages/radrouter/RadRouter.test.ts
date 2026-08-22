import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { RadRouter } from './RadRouter.ts';
import {
  DuplicateRouteError,
  MalformedPathError,
  RouteConflictError,
} from './errors/mod.ts';
import type { HTTPMethod, RouteMatch } from './types/mod.ts';

// Test context — the router is structurally agnostic, so each
// consumer provides their own context type. For the tests we just
// need a `state` field the middleware fixtures can mutate.
type TestCtx = { state: { testValue?: string } };
type TestMW = (ctx: TestCtx, next: () => Promise<void>) => Promise<void>;

// Test middleware functions
const middleware1: TestMW = async (ctx, next) => {
  ctx.state.testValue = 'middleware1';
  await next();
};

const middleware2: TestMW = async (ctx, next) => {
  ctx.state.testValue += '-middleware2';
  await next();
};

const middleware3: TestMW = async (ctx, next) => {
  ctx.state.testValue += '-middleware3';
  await next();
};

const globalMiddleware: TestMW = async (ctx, next) => {
  ctx.state.testValue = 'global';
  await next();
};

/**
 * Surface the Router test suite expects from a router implementation.
 * Factory-style so any future router that satisfies this shape can be
 * driven through the same suite.
 */
type RouterLike<M> = {
  addRoute(
    method: HTTPMethod,
    path: string,
    middlewares: M[],
    version?: string,
  ): void;
  get(path: string, middlewares: M[], version?: string): void;
  post(path: string, middlewares: M[], version?: string): void;
  put(path: string, middlewares: M[], version?: string): void;
  delete(path: string, middlewares: M[], version?: string): void;
  patch(path: string, middlewares: M[], version?: string): void;
  head(path: string, middlewares: M[], version?: string): void;
  options(path: string, middlewares: M[], version?: string): void;
  use(middleware: M): void;
  find(
    method: HTTPMethod,
    path: string,
    version?: string,
  ): RouteMatch<M> | undefined;
  clear(options?: { keepGlobalMiddlewares?: boolean }): void;
  getStats(): { totalRoutes: number; totalNodes: number };
  readonly defaultVersion?: string;
};

type RouterCtor<M> = new (
  options?: { defaultVersion?: string; caseSensitive?: boolean },
) => RouterLike<M>;

function describeRouter(
  name: string,
  Ctor: RouterCtor<TestMW>,
): void {
  it(`${name} - Basic static routes`, () => {
    const router = new Ctor();

    router.get('/users', [middleware1]);
    router.post('/users', [middleware2]);
    router.get('/products', [middleware3]);

    // Test GET /users
    const match1 = router.find('GET', '/users');
    asserts.assertExists(match1);
    asserts.assertEquals(match1.middlewares.length, 1);
    asserts.assertEquals(Object.keys(match1.params).length, 0);

    // Test POST /users
    const match2 = router.find('POST', '/users');
    asserts.assertExists(match2);
    asserts.assertEquals(match2.middlewares.length, 1);

    // Test non-existent route
    const match3 = router.find('GET', '/nonexistent');
    asserts.assertEquals(match3, undefined);

    // Test wrong method
    const match4 = router.find('DELETE', '/users');
    asserts.assertEquals(match4, undefined);
  });

  it(`${name} - Case sensitive default`, () => {
    const router = new Ctor();

    router.get('/Users/Profile', [middleware1]);

    // Exact case matches
    const exact = router.find('GET', '/Users/Profile');
    asserts.assertExists(exact);

    // Different case must NOT match — RFC 3986 strict semantics.
    asserts.assertEquals(router.find('GET', '/users/profile'), undefined);
    asserts.assertEquals(router.find('GET', '/USERS/PROFILE'), undefined);
    asserts.assertEquals(router.find('GET', '/users/Profile'), undefined);
  });

  it(`${name} - Case insensitive (opt-in)`, () => {
    const router = new Ctor({ caseSensitive: false });

    router.get('/Users/Profile', [middleware1]);

    const variations = [
      '/users/profile',
      '/Users/Profile',
      '/USERS/PROFILE',
      '/uSeRs/PrOfIlE',
    ];

    for (const path of variations) {
      const match = router.find('GET', path);
      asserts.assertExists(match, `Should match path: ${path}`);
      asserts.assertEquals(match.middlewares.length, 1);
    }
  });

  it(`${name} - Parameter routes`, () => {
    const router = new Ctor();

    router.get('/users/:userId:', [middleware1]);
    router.get('/users/:userId:/posts/:postId:', [middleware2]);

    // Test single parameter
    const match1 = router.find('GET', '/users/123');
    asserts.assertExists(match1);
    asserts.assertEquals(match1.params.userId, '123');
    asserts.assertEquals(match1.middlewares.length, 1);

    // Test multiple parameters
    const match2 = router.find('GET', '/users/456/posts/789');
    asserts.assertExists(match2);
    asserts.assertEquals(match2.params.userId, '456');
    asserts.assertEquals(match2.params.postId, '789');
    asserts.assertEquals(match2.middlewares.length, 1);

    // Parameter values themselves preserve case (only static path segments
    // are subject to the caseSensitive option).
    const cased = router.find('GET', '/users/AbCdEf/posts/XyZ');
    asserts.assertExists(cased);
    asserts.assertEquals(cased.params.userId, 'AbCdEf');
    asserts.assertEquals(cased.params.postId, 'XyZ');
  });

  it(`${name} - Greedy parameters`, () => {
    const router = new Ctor();

    // Suffix greedy: :path:-*
    router.get('/files/:path:-*', [middleware1]);

    // Prefix greedy: *-:id:  — URL-greedy. The `*` may span slashes;
    // `:version:` is captured *after* the dash as a single segment.
    router.get('/api/*-:version:/data', [middleware2]);

    // Test suffix greedy - single segment
    const match1 = router.find('GET', '/files/documents');
    asserts.assertExists(match1);
    asserts.assertEquals(match1.params.path, 'documents');

    // Test suffix greedy - multiple segments captured into one string
    const match1Multi = router.find('GET', '/files/docs/readme.md');
    asserts.assertExists(match1Multi);
    asserts.assertEquals(match1Multi.params.path, 'docs/readme.md');

    // Test suffix greedy - deeply nested
    const match1Deep = router.find('GET', '/files/a/b/c/d/e.txt');
    asserts.assertExists(match1Deep);
    asserts.assertEquals(match1Deep.params.path, 'a/b/c/d/e.txt');

    // Prefix greedy — `*` consumed `v1`, `:version:` captured `v2`.
    const match2 = router.find('GET', '/api/v1-v2/data');
    asserts.assertExists(match2);
    asserts.assertEquals(match2.params.version, 'v2');

    // Prefix greedy across multiple segments — `*` may span slashes.
    const match2Multi = router.find(
      'GET',
      '/api/release/2024-01-snapshot/data',
    );
    asserts.assertExists(match2Multi);
    asserts.assertEquals(match2Multi.params.version, 'snapshot');

    // Multi-dash within the captured segment — rightmost dash is the
    // separator; `:version:` captures the trailing token.
    const match2Multi2 = router.find('GET', '/api/foo-bar-baz/data');
    asserts.assertExists(match2Multi2);
    asserts.assertEquals(match2Multi2.params.version, 'baz');
  });

  it(`${name} - Versioned routes`, () => {
    const router = new Ctor();

    router.get('/api/users', [middleware1], 'v1');
    router.get('/api/users', [middleware2], 'v2');
    router.get('/api/users', [middleware3]); // no version

    // Test version matching
    const match1 = router.find('GET', '/api/users', 'v1');
    asserts.assertExists(match1);
    asserts.assertEquals(match1.middlewares.length, 1);

    const match2 = router.find('GET', '/api/users', 'v2');
    asserts.assertExists(match2);
    asserts.assertEquals(match2.middlewares.length, 1);

    // Test fallback to non-versioned
    const match3 = router.find('GET', '/api/users', 'v3');
    asserts.assertExists(match3);
    asserts.assertEquals(match3.middlewares.length, 1);

    // Test without version
    const match4 = router.find('GET', '/api/users');
    asserts.assertExists(match4);
    asserts.assertEquals(match4.middlewares.length, 1);
  });

  it(`${name} - Default version (constructor)`, () => {
    const router = new Ctor({ defaultVersion: 'v2.1' });

    router.get('/api/users', [middleware1], 'v2.1');
    router.get('/api/users', [middleware2], 'v2.0');
    router.get('/api/orders', [middleware3]);

    const exact = router.find('GET', '/api/users', 'v2.1');
    asserts.assertExists(exact);
    asserts.assertEquals(exact.middlewares[0], middleware1);

    const aliased = router.find('GET', '/api/users');
    asserts.assertExists(aliased);
    asserts.assertEquals(aliased.middlewares[0], middleware1);

    const older = router.find('GET', '/api/users', 'v2.0');
    asserts.assertExists(older);
    asserts.assertEquals(older.middlewares[0], middleware2);

    const future = router.find('GET', '/api/users', 'v3-preview');
    asserts.assertExists(future);
    asserts.assertEquals(future.middlewares[0], middleware1);

    const unversioned = router.find('GET', '/api/orders', 'v2.1');
    asserts.assertExists(unversioned);
    asserts.assertEquals(unversioned.middlewares[0], middleware3);

    const unversionedNoVer = router.find('GET', '/api/orders');
    asserts.assertExists(unversionedNoVer);
    asserts.assertEquals(unversionedNoVer.middlewares[0], middleware3);
  });

  it(`${name} - Default version (constructor variants)`, () => {
    const noDefault = new Ctor();
    noDefault.get('/api/data', [middleware1], 'v1');
    noDefault.get('/api/data', [middleware2], 'v2');
    asserts.assertEquals(noDefault.find('GET', '/api/data'), undefined);

    const v1Default = new Ctor({ defaultVersion: 'v1' });
    v1Default.get('/api/data', [middleware1], 'v1');
    v1Default.get('/api/data', [middleware2], 'v2');
    const m1 = v1Default.find('GET', '/api/data');
    asserts.assertExists(m1);
    asserts.assertEquals(m1.middlewares[0], middleware1);

    const v2Default = new Ctor({ defaultVersion: 'v2' });
    v2Default.get('/api/data', [middleware1], 'v1');
    v2Default.get('/api/data', [middleware2], 'v2');
    const m2 = v2Default.find('GET', '/api/data');
    asserts.assertExists(m2);
    asserts.assertEquals(m2.middlewares[0], middleware2);
  });

  it(`${name} - Default version with three-tier fallback ordering`, () => {
    const router = new Ctor({ defaultVersion: 'current' });

    router.get('/x', [middleware1], 'current');
    router.get('/x', [middleware2], 'legacy');
    router.get('/x', [middleware3]);

    const t1 = router.find('GET', '/x', 'legacy');
    asserts.assertExists(t1);
    asserts.assertEquals(t1.middlewares[0], middleware2);

    const t2 = router.find('GET', '/x', 'unknown');
    asserts.assertExists(t2);
    asserts.assertEquals(t2.middlewares[0], middleware1);

    router.get('/y', [middleware3]);
    const t3 = router.find('GET', '/y', 'unknown');
    asserts.assertExists(t3);
    asserts.assertEquals(t3.middlewares[0], middleware3);
  });

  it(`${name} - Global middleware`, () => {
    const router = new Ctor();

    router.use(globalMiddleware);
    router.get('/test', [middleware1]);

    const match = router.find('GET', '/test');
    asserts.assertExists(match);
    asserts.assertEquals(match.middlewares.length, 2);
    asserts.assertEquals(match.middlewares[0], globalMiddleware);
    asserts.assertEquals(match.middlewares[1], middleware1);
  });

  it(`${name} - Multiple middleware per route`, () => {
    const router = new Ctor();

    router.get('/test', [middleware1, middleware2, middleware3]);

    const match = router.find('GET', '/test');
    asserts.assertExists(match);
    asserts.assertEquals(match.middlewares.length, 3);
  });

  it(`${name} - All HTTP methods`, () => {
    const router = new Ctor();

    const methods: HTTPMethod[] = [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'HEAD',
      'OPTIONS',
    ];

    methods.forEach((method) => {
      switch (method) {
        case 'GET':
          router.get('/test', [middleware1]);
          break;
        case 'POST':
          router.post('/test', [middleware1]);
          break;
        case 'PUT':
          router.put('/test', [middleware1]);
          break;
        case 'DELETE':
          router.delete('/test', [middleware1]);
          break;
        case 'PATCH':
          router.patch('/test', [middleware1]);
          break;
        case 'HEAD':
          router.head('/test', [middleware1]);
          break;
        case 'OPTIONS':
          router.options('/test', [middleware1]);
          break;
      }
    });

    methods.forEach((method) => {
      const match = router.find(method, '/test');
      asserts.assertExists(match, `Should find route for ${method}`);
    });
  });

  it(`${name} - Path normalization (slashes)`, () => {
    const router = new Ctor();

    router.get('/test/path', [middleware1]);

    // Slash normalization: leading / inferred, trailing / stripped, no
    // case variation here — the default is case-sensitive.
    const variations = [
      '/test/path',
      '/test/path/',
      'test/path',
      'test/path/',
    ];

    for (const path of variations) {
      const match = router.find('GET', path);
      asserts.assertExists(match, `Should match path: ${path}`);
    }
  });

  it(`${name} - Route priority (static > param > greedy)`, () => {
    const router = new Ctor();

    // Add routes in different order to test priority
    router.get('/users/:id:-*', [middleware3]); // greedy
    router.get('/users/:id:', [middleware2]); // param
    router.get('/users/profile', [middleware1]); // static

    // Static should win
    const match1 = router.find('GET', '/users/profile');
    asserts.assertExists(match1);
    asserts.assertEquals(match1.middlewares[0], middleware1);
    asserts.assertEquals(Object.keys(match1.params).length, 0);

    // Param should win over greedy for exact matches
    const match2 = router.find('GET', '/users/123');
    asserts.assertExists(match2);
    asserts.assertEquals(match2.middlewares[0], middleware2);
    asserts.assertEquals(match2.params.id, '123');
  });

  it(`${name} - Complex routing scenario`, () => {
    const router = new Ctor();

    router.use(globalMiddleware);

    router.get('/api/:version:/users', [middleware1], 'v1');
    router.get('/api/:version:/users', [middleware2], 'v2');
    router.get('/api/:version:/users/:userId:', [middleware3]);
    router.get('/files/:path:-*', [middleware1]);
    router.post('/upload/*-:type:', [middleware2]);

    // Test versioned API
    const match1 = router.find('GET', '/api/v1/users', 'v1');
    asserts.assertExists(match1);
    asserts.assertEquals(match1.params.version, 'v1');
    asserts.assertEquals(match1.middlewares.length, 2); // global + route

    // Test nested parameters
    const match2 = router.find('GET', '/api/v2/users/123');
    asserts.assertExists(match2);
    asserts.assertEquals(match2.params.version, 'v2');
    asserts.assertEquals(match2.params.userId, '123');

    // Test file paths
    const match3 = router.find('GET', '/files/documents');
    asserts.assertExists(match3);
    asserts.assertEquals(match3.params.path, 'documents');

    // Test upload with prefix greedy — `*` consumed `image`,
    // `:type:` captured the trailing `jpeg`.
    const match4 = router.find('POST', '/upload/image-jpeg');
    asserts.assertExists(match4);
    asserts.assertEquals(match4.params.type, 'jpeg');
  });

  it(`${name} - Statistics and clearing`, () => {
    const router = new Ctor();

    router.get('/test1', [middleware1]);
    router.post('/test1', [middleware2]);
    router.get('/test2/:id:', [middleware3]);

    const stats = router.getStats();
    asserts.assertEquals(stats.totalRoutes, 3);

    router.clear();
    const statsAfterClear = router.getStats();
    asserts.assertEquals(statsAfterClear.totalRoutes, 0);

    // Should not find routes after clearing
    const match = router.find('GET', '/test1');
    asserts.assertEquals(match, undefined);
  });

  it(`${name} - clear({ keepGlobalMiddlewares: true }) retains globals`, () => {
    const router = new Ctor();
    router.use(globalMiddleware);
    router.get('/thing', [middleware1]);

    // Routes are dropped, but the global registered via use() survives.
    router.clear({ keepGlobalMiddlewares: true });
    asserts.assertEquals(router.getStats().totalRoutes, 0);

    router.get('/again', [middleware2]);
    const kept = router.find('GET', '/again');
    asserts.assertExists(kept);
    asserts.assertEquals(kept.middlewares.length, 2); // global + route
    asserts.assertEquals(kept.middlewares[0], globalMiddleware);
    asserts.assertEquals(kept.middlewares[1], middleware2);

    // A plain clear() drops the globals too (default behaviour).
    router.clear();
    router.get('/fresh', [middleware3]);
    const dropped = router.find('GET', '/fresh');
    asserts.assertExists(dropped);
    asserts.assertEquals(dropped.middlewares.length, 1);
    asserts.assertEquals(dropped.middlewares[0], middleware3);
  });

  it(`${name} - Edge cases`, () => {
    const router = new Ctor();

    // Root path
    router.get('/', [middleware1]);
    const rootMatch = router.find('GET', '/');
    asserts.assertExists(rootMatch);

    // Empty path should not match
    const emptyMatch = router.find('GET', '');
    asserts.assertEquals(emptyMatch, undefined);

    // Multiple slashes in route registration are merged: "/api//users"
    // registers as "/api/users".
    router.get('/api//users', [middleware2]);
    const multiSlashMatch = router.find('GET', '/api/users');
    asserts.assertExists(multiSlashMatch);

    // Lookups are strict per RFC 3986: a request to "/api//users" must
    // NOT match a route registered for "/api/users".
    const strictMiss = router.find('GET', '/api//users');
    asserts.assertEquals(strictMiss, undefined);
  });

  it(`${name} - Incremental inserts with progressive splits`, () => {
    // Specific scenario: each insert forces a split deeper in the trie.
    //   1. /api/v1/users         — single chain
    //   2. /api/v1/groups        — splits at /api/v1/ → siblings users / groups
    //   3. /api/v2/users         — splits at /api/v   → 1/{users,groups} vs 2/users
    // After step 3 a correct implementation routes all three originals AND
    // does not invent a route /api/v1/posts that nobody registered.
    const router = new Ctor();
    router.get('/api/v1/users', [middleware1]);
    router.get('/api/v1/groups', [middleware2]);
    router.get('/api/v2/users', [middleware3]);

    const m1 = router.find('GET', '/api/v1/users');
    asserts.assertExists(
      m1,
      'After progressive splits: /api/v1/users must still match',
    );
    asserts.assertEquals(m1.middlewares[0], middleware1);

    const m2 = router.find('GET', '/api/v1/groups');
    asserts.assertExists(m2, '/api/v1/groups must match');
    asserts.assertEquals(m2.middlewares[0], middleware2);

    const m3 = router.find('GET', '/api/v2/users');
    asserts.assertExists(m3, '/api/v2/users must match');
    asserts.assertEquals(m3.middlewares[0], middleware3);

    // Negative cases: the splits must not invent matches.
    asserts.assertEquals(router.find('GET', '/api/v1/posts'), undefined);
    asserts.assertEquals(router.find('GET', '/api/v2/groups'), undefined);
    asserts.assertEquals(router.find('GET', '/api/v3/users'), undefined);
    asserts.assertEquals(router.find('GET', '/api/v'), undefined);
    asserts.assertEquals(router.find('GET', '/api/v1/'), undefined); // strict trailing slash
  });

  it(`${name} - Param with literal suffix (single segment)`, () => {
    const router = new Ctor();
    router.get('/files/:name:.jpeg', [middleware1]);
    router.get('/files/:name:.png', [middleware2]);

    // Exact suffix match — captures name without the extension
    const m1 = router.find('GET', '/files/sunset.jpeg');
    asserts.assertExists(m1);
    asserts.assertEquals(m1.params.name, 'sunset');
    asserts.assertEquals(m1.middlewares[0], middleware1);

    const m2 = router.find('GET', '/files/sunset.png');
    asserts.assertExists(m2);
    asserts.assertEquals(m2.params.name, 'sunset');
    asserts.assertEquals(m2.middlewares[0], middleware2);

    // Wrong extension — must NOT match (no fallback)
    asserts.assertEquals(router.find('GET', '/files/sunset.gif'), undefined);

    // No extension — must NOT match
    asserts.assertEquals(router.find('GET', '/files/sunset'), undefined);

    // Truncated / extended extensions — must NOT match
    asserts.assertEquals(router.find('GET', '/files/sunset.jpe'), undefined);
    asserts.assertEquals(router.find('GET', '/files/sunset.jpegg'), undefined);

    // Empty captured name — must NOT match (the `.jpeg` edge case)
    asserts.assertEquals(router.find('GET', '/files/.jpeg'), undefined);
  });

  it(`${name} - Param with suffix: greedy from the right`, () => {
    const router = new Ctor();
    router.get('/files/:name:.jpeg', [middleware1]);

    // The captured name should be everything up to the LAST .jpeg in the
    // segment, supporting filenames that contain dots.
    const m = router.find('GET', '/files/photo.2024.05.jpeg');
    asserts.assertExists(m);
    asserts.assertEquals(m.params.name, 'photo.2024.05');
  });

  it(`${name} - Param with suffix: longer suffix wins`, () => {
    const router = new Ctor();
    router.get('/files/:name:.gz', [middleware1]);
    router.get('/files/:name:.tar.gz', [middleware2]);

    // .tar.gz is more specific (longer) — should win
    const m1 = router.find('GET', '/files/archive.tar.gz');
    asserts.assertExists(m1);
    asserts.assertEquals(m1.params.name, 'archive');
    asserts.assertEquals(m1.middlewares[0], middleware2);

    // Plain .gz still works for non-tar files
    const m2 = router.find('GET', '/files/single.gz');
    asserts.assertExists(m2);
    asserts.assertEquals(m2.params.name, 'single');
    asserts.assertEquals(m2.middlewares[0], middleware1);
  });

  it(`${name} - Param with suffix coexists with plain param`, () => {
    const router = new Ctor();
    router.get('/files/:name:.jpeg', [middleware1]); // suffixed
    router.get('/files/:name:', [middleware2]); // plain catch-all

    // Suffixed wins when the suffix matches
    const m1 = router.find('GET', '/files/sunset.jpeg');
    asserts.assertExists(m1);
    asserts.assertEquals(m1.middlewares[0], middleware1);
    asserts.assertEquals(m1.params.name, 'sunset');

    // Plain catches everything else
    const m2 = router.find('GET', '/files/sunset.gif');
    asserts.assertExists(m2);
    asserts.assertEquals(m2.middlewares[0], middleware2);
    asserts.assertEquals(m2.params.name, 'sunset.gif');

    const m3 = router.find('GET', '/files/sunset');
    asserts.assertExists(m3);
    asserts.assertEquals(m3.middlewares[0], middleware2);
    asserts.assertEquals(m3.params.name, 'sunset');
  });

  it(`${name} - Param with suffix conflict throws`, () => {
    const router = new Ctor();
    router.get('/files/:name:.jpeg', [middleware1]);
    let threw = false;
    try {
      // Same suffix, different param name → conflict
      router.get('/files/:photo:.jpeg', [middleware2]);
    } catch (e) {
      threw = true;
      asserts.assertInstanceOf(e, RouteConflictError);
      asserts.assertEquals(e.context.suffix, '.jpeg');
      asserts.assertEquals(e.context.newParamName, 'photo');
    }
    asserts.assertEquals(threw, true);
  });

  it(`${name} - Plain-param name conflict throws`, () => {
    const router = new Ctor();
    router.get('/users/:id:', [middleware1]);
    let threw = false;
    try {
      // Same trie position, different param name → conflict.
      router.get('/users/:userId:', [middleware2]);
    } catch (e) {
      threw = true;
      asserts.assertInstanceOf(e, RouteConflictError);
      asserts.assertEquals(e.context.existingParamName, 'id');
      asserts.assertEquals(e.context.newParamName, 'userId');
      asserts.assertEquals(e.context.path, '/users/:userId:');
    }
    asserts.assertEquals(threw, true);

    // The original binding is untouched — the conflicting registration
    // left nothing behind.
    const m = router.find('GET', '/users/42');
    asserts.assertExists(m);
    asserts.assertEquals(m.params.id, '42');
  });

  it(`${name} - Greedy param conflict throws`, () => {
    // Different greedy KIND at the same position: suffix then prefix.
    const kindRouter = new Ctor();
    kindRouter.get('/f/:a:-*', [middleware1]); // greedy_suffix
    let kindThrew = false;
    try {
      kindRouter.get('/f/*-:b:', [middleware2]); // greedy_prefix, same node
    } catch (e) {
      kindThrew = true;
      asserts.assertInstanceOf(e, RouteConflictError);
      asserts.assertEquals(e.context.path, '/f/*-:b:');
    }
    asserts.assertEquals(kindThrew, true);

    // Same kind, different param NAME also conflicts.
    const nameRouter = new Ctor();
    nameRouter.get('/f/:a:-*', [middleware1]);
    let nameThrew = false;
    try {
      nameRouter.get('/f/:b:-*', [middleware2]);
    } catch (e) {
      nameThrew = true;
      asserts.assertInstanceOf(e, RouteConflictError);
      asserts.assertEquals(e.context.existingParamName, 'a');
      asserts.assertEquals(e.context.newParamName, 'b');
    }
    asserts.assertEquals(nameThrew, true);

    // Re-registering the identical greedy binding is a plain duplicate,
    // not a conflict — the greedy branch composes normally otherwise.
    const okRouter = new Ctor();
    okRouter.get('/f/:a:-*', [middleware1]);
    okRouter.post('/f/:a:-*', [middleware2]); // same node, different method
    asserts.assertExists(okRouter.find('GET', '/f/x/y'));
    asserts.assertExists(okRouter.find('POST', '/f/x/y'));
  });

  it(`${name} - Insert preserves descendants across deep splits`, () => {
    // A route is inserted, then a sibling forces a split *above* it in the
    // trie. The original route's deeper structure must survive.
    const router = new Ctor();
    router.get('/api/v1/users/profile', [middleware1]);
    router.get('/api/v1/users/settings', [middleware2]); // splits at /api/v1/users/
    router.get('/api/v1/groups', [middleware3]); // splits at /api/v1/

    asserts.assertExists(
      router.find('GET', '/api/v1/users/profile'),
      'Deep route must survive an upstream split',
    );
    asserts.assertExists(router.find('GET', '/api/v1/users/settings'));
    asserts.assertExists(router.find('GET', '/api/v1/groups'));
    asserts.assertEquals(router.find('GET', '/api/v1/users'), undefined); // intermediate has no handler
  });

  it(`${name} - Split preserves paramSuffix children`, () => {
    // Registering a route with param-with-literal-suffix descendants,
    // then forcing a radix split *above* it, must keep the suffix
    // descendants reachable. Regression for a split that moved
    // staticChildren/paramChild/greedyChild/handlers but stranded
    // paramSuffixChildren on the wrong node.
    const router = new Ctor();
    router.get('/api/files/:name:.jpg', [middleware1]);
    router.get('/apex/health', [middleware2]); // forces split at '/ap'
    const match = router.find('GET', '/api/files/sunset.jpg');
    asserts.assertExists(match, 'param-suffix route must survive split');
    asserts.assertEquals(match.params.name, 'sunset');
    asserts.assertEquals(match.middlewares[0], middleware1);
  });

  it(`${name} - Duplicate route registration throws`, () => {
    const router = new Ctor();
    router.get('/users', [middleware1]);
    let threw = false;
    try {
      router.get('/users', [middleware2]);
    } catch (e) {
      threw = true;
      asserts.assertInstanceOf(e, DuplicateRouteError);
      asserts.assertEquals(e.context.method, 'GET');
      asserts.assertEquals(e.context.path, '/users');
    }
    asserts.assertEquals(threw, true);

    // Same path, different version is NOT a duplicate.
    router.get('/users', [middleware2], 'v1');
    router.get('/users', [middleware3], 'v2');

    // Same path, different method is NOT a duplicate.
    router.post('/users', [middleware2]);

    // Re-registering same method + same version throws too.
    let v1Threw = false;
    try {
      router.get('/users', [middleware3], 'v1');
    } catch (e) {
      v1Threw = true;
      asserts.assertInstanceOf(e, DuplicateRouteError);
      asserts.assertEquals(e.context.version, 'v1');
    }
    asserts.assertEquals(v1Threw, true);
  });

  it(`${name} - Case-insensitive routing preserves param case`, () => {
    const router = new Ctor({ caseSensitive: false });
    router.get('/users/:userId:/posts/:postId:', [middleware1]);
    const match = router.find('GET', '/USERS/AbCdEf/POSTS/XyZ-123');
    asserts.assertExists(match);
    asserts.assertEquals(match.params.userId, 'AbCdEf');
    asserts.assertEquals(match.params.postId, 'XyZ-123');
  });

  it(`${name} - Case-insensitive folds non-ASCII uppercase`, () => {
    // Regression: folding was gated on ASCII [A-Z], so a static segment
    // whose ONLY uppercase was non-ASCII (e.g. 'Ü', no ASCII letter to
    // trip the gate) never folded and silently failed to match under
    // caseSensitive:false. '/Über' has no ASCII uppercase, so it must
    // still be reachable case-insensitively.
    const router = new Ctor({ caseSensitive: false });
    router.get('/Über', [middleware1]);
    for (const path of ['/über', '/ÜBER', '/Über']) {
      asserts.assertExists(
        router.find('GET', path),
        `case-insensitive should match ${path}`,
      );
    }
  });

  it(`${name} - Case-insensitive fold keeps param slices aligned`, () => {
    // Regression: an expanding Unicode fold ('İ' U+0130 → 'i̇', one UTF-16
    // unit becoming two) desynced the folded match-URL from the
    // original-case URL, leaking the segment boundary into the captured
    // value ('İX/' instead of 'İX') and slicing later params at the wrong
    // offset. A length-preserving fold keeps the two views aligned.
    const router = new Ctor({ caseSensitive: false });
    router.get('/files/:name:/data', [middleware1]);
    const match = router.find('GET', '/files/İX/data');
    asserts.assertExists(match);
    asserts.assertEquals(match.params.name, 'İX'); // no trailing slash leak

    // The param value itself keeps the request's original case.
    const router2 = new Ctor({ caseSensitive: false });
    router2.get('/u/:id:', [middleware1]);
    const m2 = router2.find('GET', '/u/İabc');
    asserts.assertExists(m2);
    asserts.assertEquals(m2.params.id, 'İabc');
  });

  it(`${name} - Captured params are percent-decoded`, () => {
    const router = new Ctor();
    router.get('/users/:id:', [middleware1]);

    // Encoded slash decodes — closes the "decode-after-check" bypass:
    // downstream guards now see the real value, not the raw %2F.
    const slash = router.find('GET', '/users/a%2Fb');
    asserts.assertExists(slash);
    asserts.assertEquals(slash.params.id, 'a/b');

    // Encoded space.
    const space = router.find('GET', '/users/john%20doe');
    asserts.assertExists(space);
    asserts.assertEquals(space.params.id, 'john doe');

    // Encoded dot-dot — surfaced decoded so traversal guards can catch it.
    const dotdot = router.find('GET', '/users/%2e%2e');
    asserts.assertExists(dotdot);
    asserts.assertEquals(dotdot.params.id, '..');

    // Unencoded values pass through untouched.
    const plain = router.find('GET', '/users/123');
    asserts.assertExists(plain);
    asserts.assertEquals(plain.params.id, '123');
  });

  it(`${name} - Malformed percent-encoding is a graceful miss`, () => {
    const router = new Ctor();
    router.get('/users/:id:', [middleware1]);

    // A lone `%` (and other malformed escapes) make decodeURIComponent
    // throw; that must surface as a lookup miss, never an exception.
    for (const bad of ['/users/%', '/users/%zz', '/users/100%']) {
      asserts.assertEquals(
        router.find('GET', bad),
        undefined,
        `malformed encoding should miss: ${bad}`,
      );
    }
  });

  it(`${name} - Percent-decoding for suffixed and greedy captures`, () => {
    const router = new Ctor();
    router.get('/img/:name:.png', [middleware1]); // suffixed param
    router.get('/files/:path:-*', [middleware2]); // greedy suffix
    router.get('/api/*-:version:/data', [middleware3]); // greedy prefix

    // Suffixed param value is decoded.
    const suffixed = router.find('GET', '/img/a%20b.png');
    asserts.assertExists(suffixed);
    asserts.assertEquals(suffixed.params.name, 'a b');

    // Greedy-suffix capture is decoded.
    const greedy = router.find('GET', '/files/a%20b/c');
    asserts.assertExists(greedy);
    asserts.assertEquals(greedy.params.path, 'a b/c');

    // Greedy-prefix trailing token is decoded.
    const prefix = router.find('GET', '/api/v1-v%20final/data');
    asserts.assertExists(prefix);
    asserts.assertEquals(prefix.params.version, 'v final');

    // Malformed escape in a suffixed capture is a graceful miss.
    asserts.assertEquals(router.find('GET', '/img/a%.png'), undefined);
  });

  it(`${name} - Greedy suffix must be the last segment`, () => {
    const router = new Ctor();

    // A greedy suffix swallows every remaining segment, so a trailing
    // static chunk is unreachable — reject it at registration instead of
    // silently registering a route that 404s in production.
    let staticThrew = false;
    try {
      router.get('/files/:path:-*/download', [middleware1]);
    } catch (e) {
      staticThrew = true;
      asserts.assertInstanceOf(e, MalformedPathError);
      asserts.assertEquals(e.context.segment, ':path:-*');
    }
    asserts.assertEquals(staticThrew, true);

    // A trailing param chunk is equally unreachable.
    let paramThrew = false;
    try {
      router.get('/files/:path:-*/:id:', [middleware2]);
    } catch (e) {
      paramThrew = true;
      asserts.assertInstanceOf(e, MalformedPathError);
    }
    asserts.assertEquals(paramThrew, true);

    // The rejected registrations left nothing behind.
    asserts.assertEquals(router.getStats().totalRoutes, 0);

    // A greedy suffix that IS last registers fine and remains reachable
    // across the segments it swallows.
    router.get('/files/:path:-*', [middleware3]);
    const match = router.find('GET', '/files/a/b/download');
    asserts.assertExists(match);
    asserts.assertEquals(match.params.path, 'a/b/download');
    asserts.assertEquals(match.middlewares[0], middleware3);

    // A greedy PREFIX followed by a static anchor is a different pattern
    // and stays legal — the terminality rule is greedy-suffix-only.
    router.get('/api/*-:version:/data', [middleware1]);
    const prefix = router.find('GET', '/api/v1-v2/data');
    asserts.assertExists(prefix);
    asserts.assertEquals(prefix.params.version, 'v2');
  });

  it(`${name} - Empty path is rejected, root path is valid`, () => {
    const router = new Ctor();

    // An empty registration would attach a handler no lookup can reach.
    let addRouteThrew = false;
    try {
      router.addRoute('GET', '', [middleware1]);
    } catch (e) {
      addRouteThrew = true;
      asserts.assertInstanceOf(e, MalformedPathError);
      asserts.assertEquals(e.context.segment, '');
    }
    asserts.assertEquals(addRouteThrew, true);

    // The shorthand rejects it too.
    let shorthandThrew = false;
    try {
      router.get('', [middleware2]);
    } catch (e) {
      shorthandThrew = true;
      asserts.assertInstanceOf(e, MalformedPathError);
    }
    asserts.assertEquals(shorthandThrew, true);

    asserts.assertEquals(router.getStats().totalRoutes, 0);

    // The root route '/' remains valid and findable — only truly empty
    // paths are rejected.
    router.get('/', [middleware3]);
    const root = router.find('GET', '/');
    asserts.assertExists(root);
    asserts.assertEquals(root.middlewares[0], middleware3);
  });

  it(`${name} - Malformed paths throw MalformedPathError`, () => {
    const router = new Ctor();

    // Invalid parameter name — must match [A-Za-z_]\w*.
    let nameThrew = false;
    try {
      router.get('/users/:1bad:', [middleware1]);
    } catch (e) {
      nameThrew = true;
      asserts.assertInstanceOf(e, MalformedPathError);
      asserts.assertEquals(e.context.segment, ':1bad:');
      asserts.assertEquals(e.context.paramName, '1bad');
    }
    asserts.assertEquals(nameThrew, true);

    // A segment that contains ':' but matches none of the four forms.
    let segThrew = false;
    try {
      router.get('/users/foo:bar', [middleware2]);
    } catch (e) {
      segThrew = true;
      asserts.assertInstanceOf(e, MalformedPathError);
      asserts.assertEquals(e.context.segment, 'foo:bar');
    }
    asserts.assertEquals(segThrew, true);

    // Nothing registered by the failed calls.
    asserts.assertEquals(router.getStats().totalRoutes, 0);
  });

  it(`${name} - TRACE and CONNECT register via addRoute`, () => {
    const router = new Ctor();

    // No shorthand exists for these two — addRoute is the only path.
    router.addRoute('TRACE', '/debug', [middleware1]);
    router.addRoute('CONNECT', '/tunnel', [middleware2]);

    const trace = router.find('TRACE', '/debug');
    asserts.assertExists(trace);
    asserts.assertEquals(trace.middlewares[0], middleware1);

    const connect = router.find('CONNECT', '/tunnel');
    asserts.assertExists(connect);
    asserts.assertEquals(connect.middlewares[0], middleware2);

    // A different method on the same path still misses.
    asserts.assertEquals(router.find('GET', '/debug'), undefined);
  });

  it(`${name} - Non-BMP sibling labels sharing a high surrogate both register`, () => {
    // Regression: the insert-time longest-common-prefix loop compared
    // code POINTS (`codePointAt`, which steps atomically over a surrogate
    // pair) while the trie keys its child buckets by a single UTF-16 code
    // UNIT. Two sibling static labels beginning with different astral code
    // points that share one high surrogate (U+20000 '𠀀' / U+20001 '𠀁',
    // both high surrogate 0xD840; or 😀/😁, both 0xD83D) then bucketed
    // under the identical high-surrogate key, so the second insert clobbered
    // the first and silently dropped a registered route.
    const router = new Ctor();
    router.get('/u/\u{20000}', [middleware1]); // 𠀀 CJK Ext-B
    router.get('/u/\u{20001}', [middleware2]); // 𠀁

    // Both registrations must survive — one must not overwrite the other.
    asserts.assertEquals(router.getStats().totalRoutes, 2);

    const a = router.find('GET', '/u/\u{20000}');
    asserts.assertExists(a, 'first non-BMP route must not be clobbered');
    asserts.assertEquals(a.middlewares[0], middleware1);

    const b = router.find('GET', '/u/\u{20001}');
    asserts.assertExists(b);
    asserts.assertEquals(b.middlewares[0], middleware2);

    // Emoji variant — both share high surrogate 0xD83D.
    const r2 = new Ctor();
    r2.get('/e/\u{1F600}', [middleware1]); // 😀
    r2.get('/e/\u{1F601}', [middleware2]); // 😁
    asserts.assertEquals(r2.getStats().totalRoutes, 2);
    const e0 = r2.find('GET', '/e/\u{1F600}');
    asserts.assertExists(e0);
    asserts.assertEquals(e0.middlewares[0], middleware1);
    const e1 = r2.find('GET', '/e/\u{1F601}');
    asserts.assertExists(e1);
    asserts.assertEquals(e1.middlewares[0], middleware2);
  });

  it(`${name} - Param named after an Object.prototype member never leaks a function`, () => {
    // Regression: the captured-params bag was a plain `{}` (inherits
    // Object.prototype), so a param named after a prototype member read
    // the inherited *function* during the backtrack-restore probe
    // (`const prev = params[name]`) and, since `prev !== undefined`, wrote
    // it back as an own enumerable property. A sibling greedy branch then
    // succeeding surfaced that Function inside RouteParams, breaking the
    // `{ [key: string]: string }` contract and polluting `Object.keys`.
    for (
      const proto of [
        'constructor',
        'toString',
        'valueOf',
        'hasOwnProperty',
        // `__proto__` is the actual prototype-pollution vector and a valid
        // `[A-Za-z_]\w*` name — a plain `{}` bag would swallow the write
        // via the inherited setter; the null-proto bag stores it own.
        '__proto__',
      ]
    ) {
      const router = new Ctor();
      router.get(`/y/:${proto}:/deep`, [middleware1]);
      router.get('/y/:rest:-*', [middleware2]);

      // `:proto:` captures 'abc', fails to match '/deep', backtracks; the
      // greedy sibling then captures the whole tail.
      const m = router.find('GET', '/y/abc/other');
      asserts.assertExists(m, `greedy sibling should match for :${proto}:`);
      asserts.assertEquals(m.middlewares[0], middleware2);
      asserts.assertEquals(m.params.rest, 'abc/other');
      // The failed `:proto:` branch must leave nothing behind.
      asserts.assertEquals(
        Object.keys(m.params),
        ['rest'],
        `no leaked "${proto}" key`,
      );
      const leaked = (m.params as Record<string, unknown>)[proto];
      asserts.assertEquals(
        typeof leaked,
        'undefined',
        `"${proto}" must not leak a value`,
      );
    }
  });

  it(`${name} - match.params is a null-prototype object (documented contract)`, () => {
    // The captured-params bag is `Object.create(null)` (a deliberate
    // safety fix — see the RouteParams JSDoc and docs/RadRouter-API.md).
    // This pins the resulting *public runtime shape*: `params` inherits no
    // `Object.prototype` methods, so it must be read as data. A revert to
    // a plain `{}` (proto === Object.prototype) fails the first assertion.
    const router = new Ctor();
    router.get('/users/:id:', [middleware1]);
    const m = router.find('GET', '/users/42');
    asserts.assertExists(m);

    // The contract: a null prototype.
    asserts.assertEquals(Object.getPrototypeOf(m.params), null);

    // Data access works exactly as `{ [key: string]: string }` implies.
    asserts.assertEquals(m.params.id, '42');
    asserts.assert('id' in m.params);
    asserts.assertEquals(Object.keys(m.params), ['id']);
    asserts.assertEquals(JSON.stringify(m.params), '{"id":"42"}');
    asserts.assert(Object.prototype.hasOwnProperty.call(m.params, 'id'));

    // Inherited `Object.prototype` helpers are absent — reading them as
    // own members yields `undefined`, and the coercions that rely on them
    // throw `TypeError`, exactly as documented.
    const bag = m.params as unknown as {
      hasOwnProperty?: unknown;
      toString?: unknown;
      constructor?: unknown;
    };
    asserts.assertEquals(typeof bag.hasOwnProperty, 'undefined');
    asserts.assertEquals(typeof bag.toString, 'undefined');
    asserts.assertEquals(bag.constructor, undefined);
    asserts.assertThrows(() => String(m.params));
  });

  it(`${name} - Greedy-suffix capture is the raw remainder (may hold slashes)`, () => {
    // The greedy-suffix capture is the raw, non-normalised remainder of
    // the request path after the mount, percent-decoded once — it is NOT
    // trimmed or slash-collapsed. So it can legitimately start with '/',
    // end with '/', contain '//', or decode to an absolute path. This pins
    // that documented shape (docs/RadRouter-Patterns.md §3); a consumer
    // feeding it to the filesystem must validate it itself. (The docs used
    // to falsely promise "never starts or ends with /".)
    const router = new Ctor();
    router.get('/files/:path:-*', [middleware1]);

    // Doubled slash right after the mount → capture starts with '/'.
    const lead = router.find('GET', '/files//docs');
    asserts.assertExists(lead);
    asserts.assertEquals(lead.params.path, '/docs');

    // Trailing slash — lookup strips exactly one, so a captured '/' remains.
    const trail = router.find('GET', '/files/a//');
    asserts.assertExists(trail);
    asserts.assertEquals(trail.params.path, 'a/');

    // Percent-encoded slash decodes → capture is an absolute path.
    const abs = router.find('GET', '/files/%2Fetc%2Fpasswd');
    asserts.assertExists(abs);
    asserts.assertEquals(abs.params.path, '/etc/passwd');
  });
}

// Run the shared suite. The factory remains available for adding future
// alternative implementations side-by-side. The `it` calls inside
// `describeRouter` need a surrounding `describe` block to be picked
// up by `@tundralibs/compat/test` (Bun/Node compat) — that's the
// outer wrapper here.
describe('radrouter.RadRouter', () => {
  describeRouter('RadRouter', RadRouter);

  // Verify that splits actually compress, not just produce a
  // correctly-routing-but-unflattened trie.
  it('Splits produce compressed structure', () => {
    const router = new RadRouter<TestMW>();
    router.get('/api/v1/users', [middleware1]);
    router.get('/api/v1/groups', [middleware2]);
    router.get('/api/v2/users', [middleware3]);

    const stats = router.getStats();
    asserts.assertEquals(stats.totalRoutes, 3);
    // Expected node count for the compressed shape:
    //   root + '/api/v' + '1/' + 'users' + 'groups' + '2/users' = 6
    // A non-compressing or buggy implementation would have more.
    asserts.assertEquals(
      stats.totalNodes,
      6,
      `Expected 6 compressed nodes for 3 shared-prefix routes, got ${stats.totalNodes}`,
    );
  });

  // Stress: many shared-prefix routes still compress and remain findable.
  it('Shared-prefix routes compress and remain findable', () => {
    const router = new RadRouter<TestMW>();
    const routes = [
      '/api/v1/users',
      '/api/v1/users/:id:',
      '/api/v1/users/:id:/posts',
      '/api/v1/users/:id:/posts/:postId:',
      '/api/v1/products',
      '/api/v1/products/:id:',
      '/api/v2/users',
      '/api/v2/users/:id:',
      '/api/v2/products',
      '/api/v2/products/:id:',
    ];
    for (const route of routes) router.get(route, [middleware1]);

    const stats = router.getStats();
    // Trie compression: nodes should be less than 3× routes (loose bound;
    // the actual ratio is much tighter, this just guards against
    // catastrophic blow-up).
    asserts.assert(
      stats.totalNodes < routes.length * 3,
      `Trie not compressing: ${stats.totalNodes} nodes for ${routes.length} routes`,
    );
    for (const route of routes) {
      asserts.assertExists(
        router.find('GET', route),
        `Route not found: ${route}`,
      );
    }
  });

  // Stress: deeply parameterised single route — six params in one path.
  it('Deeply parameterised route extracts all params', () => {
    const router = new RadRouter<TestMW>();
    router.get(
      '/api/:version:/tenants/:tenantId:/users/:userId:/groups/:groupId:/permissions/:permId:/settings/:settingId:',
      [middleware1],
    );
    const match = router.find(
      'GET',
      '/api/v2/tenants/tenant123/users/user456/groups/group789/permissions/perm012/settings/setting345',
    );
    asserts.assertExists(match);
    asserts.assertEquals(match.params, {
      version: 'v2',
      tenantId: 'tenant123',
      userId: 'user456',
      groupId: 'group789',
      permId: 'perm012',
      settingId: 'setting345',
    });
  });

  // Stress: case-insensitive router handles diverse case variations.
  it('Case-insensitive router matches diverse case variations', () => {
    const router = new RadRouter<TestMW>({ caseSensitive: false });
    router.get('/API/V1/Users/:userId:/Posts/:postId:', [middleware1]);

    const variations = [
      '/api/v1/users/123/posts/456',
      '/API/V1/USERS/123/POSTS/456',
      '/Api/V1/Users/123/Posts/456',
      '/api/V1/users/123/POSTS/456',
      '/API/v1/USERS/123/posts/456',
    ];
    for (const v of variations) {
      const match = router.find('GET', v);
      asserts.assertExists(match, `Case variation not matched: ${v}`);
      asserts.assertEquals(match.params.userId, '123');
      asserts.assertEquals(match.params.postId, '456');
    }
  });

  // Regression (CPU-DoS): `*-:name:` lookup used to backtrack over every
  // '-' in the URL and run an `indexOf('/')` (O(n)) per dash — O(n²) total
  // on an all-dash path with no following '/'. A stream of such requests
  // stalls the single-threaded event loop. The fix is a single O(n) pass.
  //
  // We assert bounded *work*, not wall-clock (which would flake): we count
  // the characters scanned by String.prototype.indexOf/lastIndexOf (the
  // primitives the quadratic form abused) during one lookup and require it
  // to stay within a small linear budget. The old code's scan work grows
  // as ~n²/2 (≈2×10⁸ char comparisons at n=20000), so it blows through the
  // budget; the fixed greedy-prefix pass makes essentially no indexOf calls
  // on this path.
  it('Greedy-prefix matching is linear, not quadratic, in path length', () => {
    const router = new RadRouter<TestMW>();
    router.get('/api/*-:v:/data', [middleware1]);

    const n = 20000;
    // All dashes, no '/' after the mount → the static anchor never seats;
    // the old code ran the full quadratic backtrack before missing.
    const adversarial = '/api/' + '-'.repeat(n) + 'x';

    // Instrument the two scanning primitives for the duration of one find().
    const proto = String.prototype as unknown as {
      indexOf: (this: string, search: string, from?: number) => number;
      lastIndexOf: (this: string, search: string, from?: number) => number;
    };
    const origIndexOf = proto.indexOf;
    const origLastIndexOf = proto.lastIndexOf;
    let scanned = 0;
    const counter = (
      orig: (this: string, search: string, from?: number) => number,
    ) =>
      function (this: string, search: string, from?: number): number {
        const res = orig.call(this, search, from);
        const start = typeof from === 'number' ? from : 0;
        scanned += Math.abs((res === -1 ? this.length : res) - start);
        return res;
      };

    let miss: RouteMatch<TestMW> | undefined;
    try {
      proto.indexOf = counter(origIndexOf);
      proto.lastIndexOf = counter(origLastIndexOf);
      scanned = 0;
      miss = router.find('GET', adversarial);
    } finally {
      proto.indexOf = origIndexOf;
      proto.lastIndexOf = origLastIndexOf;
    }

    // The crafted path is a genuine miss (no '/data' tail).
    asserts.assertEquals(miss, undefined);

    // Linear budget: a few scans over the path length are fine; the old
    // quadratic (~n²/2) is orders of magnitude past this.
    asserts.assert(
      scanned <= n * 8,
      `greedy-prefix scan work is not linear: ${scanned} chars scanned for ` +
        `n=${n} dashes (linear budget ${n * 8})`,
    );
  });

  // Regression (perf): the O(n²)→O(n) greedy-prefix rewrite dropped the
  // `lastIndexOf('-')` early-out, so a dash-free tail reaching a greedy
  // node was char-stepped in JS from the end down to `pos` before missing.
  // Both forms are O(n), but the JS walk is a needless constant-factor cost
  // on the common dash-free miss path (a greedy route probed by a request
  // whose tail carries no dash). The fix restores a single native
  // `indexOf('-', pos)` short-circuit: a greedy-prefix capture is
  // impossible without a dash in the region, so the whole right-to-left
  // walk is skipped.
  //
  // We assert the short-circuit *fires* — exactly one native '-' scan, not
  // a per-char JS walk — by counting `String.prototype.indexOf` calls with
  // the '-' needle during one dash-free greedy lookup. RED (pre-fix): the
  // pass never calls indexOf('-') on this path, so the count is 0.
  it('Greedy-prefix short-circuits a dash-free tail with one native scan', () => {
    const router = new RadRouter<TestMW>();
    router.get('/api/*-:v:/data', [middleware1]);

    const proto = String.prototype as unknown as {
      indexOf: (this: string, search: string, from?: number) => number;
    };
    const origIndexOf = proto.indexOf;
    let dashScans = 0;

    let miss: RouteMatch<TestMW> | undefined;
    try {
      proto.indexOf = function (
        this: string,
        search: string,
        from?: number,
      ): number {
        if (search === '-') dashScans++;
        return origIndexOf.call(this, search, from);
      };
      // A long dash-free tail seats the static `/api/`, reaches the greedy
      // node, and misses (no dash to split `*` from `:v:`, no `/data`).
      miss = router.find('GET', '/api/' + 'x'.repeat(4096));
    } finally {
      proto.indexOf = origIndexOf;
    }

    asserts.assertEquals(miss, undefined);
    asserts.assertEquals(
      dashScans,
      1,
      `greedy-prefix should short-circuit a dash-free tail with exactly ` +
        `one native '-' scan, saw ${dashScans} (0 ⇒ the JS char-walk ran)`,
    );

    // Sanity: the short-circuit only skips dash-free tails — a dash-present
    // capture still matches and binds correctly.
    const hit = router.find('GET', '/api/1.2-beta/data');
    asserts.assertExists(hit);
    asserts.assertEquals(hit.params.v, 'beta');
  });

  // ---------- allowedMethods ----------

  // Every HTTP method allowedMethods can report, so the consistency helper
  // probes the same surface the implementation loops over.
  const ALL_METHODS: HTTPMethod[] = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'HEAD',
    'OPTIONS',
    'TRACE',
    'CONNECT',
  ];

  // The correctness contract, asserted directly: for a given path/version,
  // a method is in allowedMethods iff find(method, path, version) matches.
  const assertAllowedMatchesFind = (
    router: RadRouter<TestMW>,
    path: string,
    version?: string,
  ): void => {
    const allowed = router.allowedMethods(path, version);
    for (const method of ALL_METHODS) {
      const inArray = allowed.includes(method);
      const found = router.find(method, path, version) !== undefined;
      asserts.assertEquals(
        inArray,
        found,
        `allowedMethods vs find disagree for ${method} "${path}" ` +
          `version=${version}: inArray=${inArray}, find-match=${found}`,
      );
    }
  };

  it('allowedMethods - static path returns exactly the registered methods', () => {
    const router = new RadRouter<TestMW>();
    router.get('/resource', [middleware1]);
    router.post('/resource', [middleware2]);
    router.delete('/resource', [middleware3]);

    const allowed = router.allowedMethods('/resource');
    asserts.assertEquals([...allowed].sort(), ['DELETE', 'GET', 'POST']);
    // No unregistered method leaks in.
    asserts.assertEquals(allowed.includes('PUT'), false);
    // Consistency with find for the whole method surface.
    assertAllowedMatchesFind(router, '/resource');
  });

  it('allowedMethods - unknown path returns an empty array', () => {
    const router = new RadRouter<TestMW>();
    router.get('/resource', [middleware1]);

    asserts.assertEquals(router.allowedMethods('/nonexistent'), []);
    // Does not throw and stays consistent with find (which also misses).
    assertAllowedMatchesFind(router, '/nonexistent');
  });

  it('allowedMethods - param path matches a concrete request path', () => {
    const router = new RadRouter<TestMW>();
    router.get('/users/:id:', [middleware1]);
    router.put('/users/:id:', [middleware2]);

    const allowed = router.allowedMethods('/users/42');
    asserts.assertEquals([...allowed].sort(), ['GET', 'PUT']);
    assertAllowedMatchesFind(router, '/users/42');
  });

  it('allowedMethods - version resolution mirrors find', () => {
    const router = new RadRouter<TestMW>();
    router.get('/x', [middleware1], 'v1');
    router.post('/x', [middleware2], 'v2');

    // v1: GET(v1) resolves, POST is v2-only with no defaultVersion → excluded.
    asserts.assertEquals(router.allowedMethods('/x', 'v1'), ['GET']);
    // v2: symmetric — only POST(v2) resolves.
    asserts.assertEquals(router.allowedMethods('/x', 'v2'), ['POST']);
    // No version requested and no unversioned slot → nothing resolves.
    asserts.assertEquals(router.allowedMethods('/x'), []);

    for (const version of [undefined, 'v1', 'v2', 'v3']) {
      assertAllowedMatchesFind(router, '/x', version);
    }
  });

  it('allowedMethods - defaultVersion fallback mirrors find', () => {
    const router = new RadRouter<TestMW>({ defaultVersion: 'v1' });
    router.get('/y', [middleware1], 'v1');
    router.post('/y', [middleware2], 'v2');

    // Requesting v2: GET falls back to defaultVersion v1, POST hits exact v2.
    asserts.assertEquals([...router.allowedMethods('/y', 'v2')].sort(), [
      'GET',
      'POST',
    ]);
    for (const version of [undefined, 'v1', 'v2', 'v3']) {
      assertAllowedMatchesFind(router, '/y', version);
    }
  });

  it('allowedMethods - wildcard (greedy-suffix) route matches', () => {
    const router = new RadRouter<TestMW>();
    router.get('/files/:path:-*', [middleware1]);
    router.delete('/files/:path:-*', [middleware2]);

    const allowed = router.allowedMethods('/files/a/b/c.txt');
    asserts.assertEquals([...allowed].sort(), ['DELETE', 'GET']);
    assertAllowedMatchesFind(router, '/files/a/b/c.txt');
  });

  it('allowedMethods - backtracks across nodes like find', () => {
    // A static leaf and a param leaf both answer the same concrete path on
    // different methods; find seats each on its own node, so allowedMethods
    // must report the union — the single-walk trap this method avoids.
    const router = new RadRouter<TestMW>();
    router.get('/users/me', [middleware1]);
    router.post('/users/:id:', [middleware2]);

    const allowed = router.allowedMethods('/users/me');
    asserts.assertEquals([...allowed].sort(), ['GET', 'POST']);
    assertAllowedMatchesFind(router, '/users/me');
  });

  // ---------- ignoreTrailingSlash ----------

  it('ignoreTrailingSlash - default drops the slash at registration and lookup', () => {
    const router = new RadRouter<TestMW>();
    router.get('/users', [middleware1]);
    router.get('/posts/', [middleware2]);

    // A stray request slash reaches the slash-less registration …
    asserts.assertExists(router.find('GET', '/users/'));
    // … and a slash-ful registration answers the slash-less request.
    asserts.assertExists(router.find('GET', '/posts'));
  });

  it('ignoreTrailingSlash:false - a slash-less route does not answer a slashed request', () => {
    const router = new RadRouter<TestMW>({ ignoreTrailingSlash: false });
    router.get('/users', [middleware1]);

    asserts.assertExists(router.find('GET', '/users'));
    asserts.assertEquals(router.find('GET', '/users/'), undefined);
  });

  it('ignoreTrailingSlash:false - a slashed route is stored with its slash and only answers it', () => {
    const router = new RadRouter<TestMW>({ ignoreTrailingSlash: false });
    router.get('/users/', [middleware1]);

    asserts.assertExists(router.find('GET', '/users/'));
    asserts.assertEquals(router.find('GET', '/users'), undefined);
  });

  it('ignoreTrailingSlash:false - /users and /users/ are distinct routes', () => {
    const router = new RadRouter<TestMW>({ ignoreTrailingSlash: false });
    // Under the default this second registration would throw
    // DuplicateRouteError; here both must coexist on their own leaves.
    router.get('/users', [middleware1]);
    router.get('/users/', [middleware2]);

    const bare = router.find('GET', '/users');
    const slashed = router.find('GET', '/users/');
    asserts.assertExists(bare);
    asserts.assertExists(slashed);
    asserts.assertStrictEquals(bare.middlewares[0], middleware1);
    asserts.assertStrictEquals(slashed.middlewares[0], middleware2);
    asserts.assertNotStrictEquals(bare.middlewares[0], slashed.middlewares[0]);
  });

  it('ignoreTrailingSlash - the root "/" matches in both modes', () => {
    for (const ignoreTrailingSlash of [true, false]) {
      const router = new RadRouter<TestMW>({ ignoreTrailingSlash });
      router.get('/', [middleware1]);
      asserts.assertExists(
        router.find('GET', '/'),
        `root miss with ignoreTrailingSlash=${ignoreTrailingSlash}`,
      );
    }
  });

  it('ignoreTrailingSlash:false - allowedMethods respects the slash like find', () => {
    const router = new RadRouter<TestMW>({ ignoreTrailingSlash: false });
    router.get('/users', [middleware1]);

    asserts.assertEquals(router.allowedMethods('/users'), ['GET']);
    asserts.assertEquals(router.allowedMethods('/users/'), []);
    assertAllowedMatchesFind(router, '/users');
    assertAllowedMatchesFind(router, '/users/');
  });
});
