import * as asserts from '@std/asserts';
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { WebServer } from '@tundralibs/compat/webserver';
import { getFreePort } from '@tundralibs/utils';
import { CacherEngineError } from '../../errors/mod.ts';
import { kvHttpBinding } from './kvHttpBinding.ts';
import { WorkersKVCacher } from './mod.ts';

type Seen = { method: string; url: string; auth: string | null; body: string };

const HTTP = { accountId: 'acc', namespaceId: 'ns', apiToken: 'tok' };
const BASE = 'https://api.cloudflare.com/client/v4/accounts/acc' +
  '/storage/kv/namespaces/ns/values/';

/** A fetch that records requests and answers from `reply`. */
const fakeFetch = (reply: (req: Request) => Response) => {
  const seen: Seen[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    seen.push({
      method: req.method,
      url: req.url,
      auth: req.headers.get('authorization'),
      body: await req.text(),
    });
    return reply(req);
  }) as typeof globalThis.fetch;
  return { seen, fetcher };
};

const cfError = (status: number, message: string) =>
  new Response(
    JSON.stringify({ success: false, errors: [{ code: 1, message }] }),
    { status, headers: { 'content-type': 'application/json' } },
  );

describe('cacher.engines.workers-kv kvHttpBinding', () => {
  it('speaks the KV REST API: paths, encoding, token, ttl and raw bodies', async () => {
    const { seen, fetcher } = fakeFetch((req) =>
      req.method === 'GET' ? new Response('stored') : new Response('{}')
    );
    const kv = kvHttpBinding(HTTP, fetcher);
    asserts.assertEquals(await kv.get('a/b c'), 'stored');
    await kv.put('k', 'v1', { expirationTtl: 120 });
    await kv.put('k', 'v2');
    await kv.delete('k');
    asserts.assertEquals(seen, [
      { method: 'GET', url: `${BASE}a%2Fb%20c`, auth: 'Bearer tok', body: '' },
      {
        method: 'PUT',
        url: `${BASE}k?expiration_ttl=120`,
        auth: 'Bearer tok',
        body: 'v1',
      },
      { method: 'PUT', url: `${BASE}k`, auth: 'Bearer tok', body: 'v2' },
      { method: 'DELETE', url: `${BASE}k`, auth: 'Bearer tok', body: '' },
    ]);
  });

  it('reads a missing key as null and surfaces Cloudflare errors', async () => {
    const missing = kvHttpBinding(
      HTTP,
      fakeFetch(() => cfError(404, 'key not found')).fetcher,
    );
    asserts.assertStrictEquals(await missing.get('k'), null);
    await missing.delete('k'); // deleting an absent key is not an error

    const denied = kvHttpBinding(
      HTTP,
      fakeFetch(() => cfError(403, 'Authentication error')).fetcher,
    );
    const err = await asserts.assertRejects(() => denied.put('k', 'v'));
    asserts.assertStringIncludes(
      (err as Error).message,
      'HTTP 403 — Authentication error',
    );
  });
});

describe('cacher.engines.workers-kv kvHttpBinding (bulk)', () => {
  it('rejects a bulk write that reports unsuccessful keys', async () => {
    const kv = kvHttpBinding(
      HTTP,
      fakeFetch(() =>
        Response.json({
          success: true,
          result: { successful_key_count: 1, unsuccessful_keys: ['b'] },
        })
      ).fetcher,
    );
    const err = await asserts.assertRejects(() =>
      kv.putMany([{ key: 'a', value: '1' }, { key: 'b', value: '2' }])
    );
    asserts.assertStringIncludes(
      (err as Error).message,
      'failed for 1 key(s): b',
    );
  });
});

describe('cacher.engines.WorkersKVCacher over http', () => {
  // A local stand-in for Cloudflare's KV REST API (one namespace).
  const store = new Map<string, string>();
  const ttls: number[] = [];
  /** Requests per bulk endpoint, to prove one call per chunk. */
  const bulkCalls = new Map<string, number>();
  const ok = (result: unknown = {}) =>
    Response.json({ success: true, errors: [], result });
  let server: WebServer;
  let baseURL = '';

  beforeAll(async () => {
    const port = await getFreePort();
    server = new WebServer('kv-rest', {
      mode: 'TCP',
      hostname: '127.0.0.1',
      port,
      handler: async (req: Request) => {
        if (req.headers.get('authorization') !== 'Bearer tok') {
          return cfError(403, 'Authentication error');
        }
        const url = new URL(req.url);
        const bulkPath = /\/bulk(\/get|\/delete)?$/.exec(url.pathname)?.[0];
        if (bulkPath !== undefined) {
          bulkCalls.set(bulkPath, (bulkCalls.get(bulkPath) ?? 0) + 1);
          const body = await req.json();
          if (bulkPath === '/bulk/get') {
            return ok({
              values: Object.fromEntries(
                (body.keys as string[]).map((k) => [k, store.get(k) ?? null]),
              ),
            });
          }
          if (bulkPath === '/bulk') {
            for (
              const item of body as {
                key: string;
                value: string;
                expiration_ttl?: number;
              }[]
            ) {
              store.set(item.key, item.value);
              if (item.expiration_ttl) ttls.push(item.expiration_ttl);
            }
            return ok({
              successful_key_count: body.length,
              unsuccessful_keys: [],
            });
          }
          for (const k of body as string[]) store.delete(k);
          return ok({
            successful_key_count: body.length,
            unsuccessful_keys: [],
          });
        }
        const key = decodeURIComponent(url.pathname.split('/values/')[1]!);
        if (req.method === 'GET') {
          const v = store.get(key);
          return v === undefined
            ? cfError(404, 'key not found')
            : new Response(v);
        }
        if (req.method === 'PUT') {
          store.set(key, await req.text());
          const ttl = url.searchParams.get('expiration_ttl');
          if (ttl !== null) ttls.push(Number(ttl));
          return new Response('{"success":true}');
        }
        store.delete(key);
        return new Response('{"success":true}');
      },
    });
    await server.start();
    baseURL = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => {
    await server.stop();
  });

  it('caches through the REST API outside a Worker', async () => {
    const cache = new WorkersKVCacher('remote', {
      http: { ...HTTP, baseURL },
      defaultExpiry: 600,
    });
    await cache.set('user:1', { name: 'Alice' });
    asserts.assertEquals(await cache.get('user:1'), { name: 'Alice' });
    asserts.assert(await cache.has('user:1'));
    asserts.assert(ttls.includes(600));
    await cache.delete('user:1');
    asserts.assertEquals(await cache.has('user:1'), false);
    await cache.set('user:2', 2);
    await cache.clear();
    asserts.assertEquals(await cache.get('user:2'), undefined);
  });

  it('bulk calls use the REST bulk endpoints: one request per chunk', async () => {
    const cache = new WorkersKVCacher('bulky', {
      http: { ...HTTP, baseURL },
      defaultExpiry: 600,
    });
    const keys = Array.from({ length: 150 }, (_, i) => `k${i}`);
    bulkCalls.clear();
    await cache.setMany(keys.map((k, i): [string, number] => [k, i]));
    const found = await cache.getMany([...keys, 'absent']);
    asserts.assertEquals(found.size, 150);
    asserts.assertEquals(found.get('k149'), 149);
    asserts.assertEquals(found.has('absent'), false);
    await cache.deleteMany(keys.slice(0, 10));
    asserts.assertEquals((await cache.getMany(keys)).size, 140);
    asserts.assertEquals(
      Object.fromEntries(bulkCalls),
      // 151 then 150 keys read 100 at a time; one write; one delete.
      { '/bulk': 1, '/bulk/get': 4, '/bulk/delete': 1 },
    );
    asserts.assert(ttls.includes(600));
  });

  it('a rejected token is OPERATION_FAILED with the API error', async () => {
    const cache = new WorkersKVCacher('remote', {
      http: { ...HTTP, apiToken: 'wrong', baseURL },
    });
    const err = await asserts.assertRejects(
      () => cache.set('k', 1),
      CacherEngineError,
    );
    asserts.assertEquals(err.code, 'OPERATION_FAILED');
    asserts.assertStringIncludes(err.message, 'Authentication error');
  });
});

describe('cacher.engines.WorkersKVCacher http config', () => {
  const kv = {
    get: () => Promise.resolve(null),
    put: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  };
  const code = (fn: () => unknown) =>
    (asserts.assertThrows(fn, CacherEngineError) as CacherEngineError).code;

  it('takes exactly one of binding or http, with every http field set', () => {
    asserts.assertEquals(
      code(() => new WorkersKVCacher('x', {} as never)),
      'CONFIG_MISSING',
    );
    asserts.assertEquals(
      code(() =>
        new WorkersKVCacher('x', { binding: kv, http: HTTP } as never)
      ),
      'CONFIG_INVALID',
    );
    for (const field of ['accountId', 'namespaceId', 'apiToken']) {
      asserts.assertEquals(
        code(() =>
          new WorkersKVCacher('x', { http: { ...HTTP, [field]: ' ' } })
        ),
        'CONFIG_INVALID',
      );
    }
  });
});
