/**
 * @fileoverview The observability hooks: `headerProvider` (per-request
 * outbound headers, contained on throw, correct precedence) and `witness`
 * (the suite convention — wraps the WHOLE request, so the provider fires
 * inside the witnessed window: the composition tracing depends on).
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { RESTler } from '../mod.ts';
import { RESTlerConfigError } from '../errors/mod.ts';
import type {
  RESTlerHeaderProvider,
  RESTlerOptions,
  Witness,
  WitnessInfo,
} from '../types/mod.ts';

class HookedRESTler extends RESTler {
  public readonly vendor = 'hooked';

  constructor(options: Partial<RESTlerOptions> = {}) {
    super({ baseURL: 'https://api.example.dev', ...options });
  }

  /** Capture the headers the wire would actually see. */
  public captureFetch(sink: { headers?: Record<string, string> }) {
    this._fetch = (_input, init) => {
      sink.headers = { ...(init?.headers as Record<string, string>) };
      return Promise.resolve(
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
  }

  public get(path: string, headers?: Record<string, string>) {
    return this._makeRequest<{ ok: boolean }>({ path, method: 'GET', headers });
  }
}

describe('restler.hooks', () => {
  describe('headerProvider', () => {
    it('puts provider headers on the wire, fresh per request', async () => {
      let n = 0;
      const client = new HookedRESTler({
        headerProvider: () => ({ 'x-request-n': String(++n) }),
      });
      const sink: { headers?: Record<string, string> } = {};
      client.captureFetch(sink);

      await client.get('/a');
      asserts.assertEquals(sink.headers!['x-request-n'], '1');
      await client.get('/b');
      asserts.assertEquals(sink.headers!['x-request-n'], '2');
    });

    it('layers between defaults and endpoint headers (explicit beats ambient)', async () => {
      const client = new HookedRESTler({
        headers: { 'x-layer': 'default', 'x-from-default': 'yes' },
        headerProvider: () => ({
          'x-layer': 'provider',
          'x-explicit': 'provider',
          'x-from-provider': 'yes',
        }),
      });
      const sink: { headers?: Record<string, string> } = {};
      client.captureFetch(sink);

      await client.get('/a', { 'x-explicit': 'endpoint' });
      asserts.assertEquals(sink.headers!['x-layer'], 'provider'); // provider > default
      asserts.assertEquals(sink.headers!['x-explicit'], 'endpoint'); // endpoint > provider
      asserts.assertEquals(sink.headers!['x-from-default'], 'yes');
      asserts.assertEquals(sink.headers!['x-from-provider'], 'yes');
    });

    it('does not clobber auth (auth always wins)', async () => {
      const client = new HookedRESTler({
        auth: { type: 'BEARER', token: 'real-token' },
        headerProvider: () => ({ Authorization: 'Bearer forged' }),
      });
      const sink: { headers?: Record<string, string> } = {};
      client.captureFetch(sink);

      await client.get('/a');
      asserts.assertEquals(
        sink.headers!['Authorization'],
        'BEARER real-token',
      );
    });

    it('contains a throwing provider — the request still succeeds', async () => {
      const client = new HookedRESTler({
        headerProvider: () => {
          throw new Error('observability bug');
        },
      });
      const sink: { headers?: Record<string, string> } = {};
      client.captureFetch(sink);

      const res = await client.get('/a');
      asserts.assertEquals(res.status, 200);
      asserts.assertEquals('x-anything' in sink.headers!, false);
    });

    it('rejects a non-function at construction', () => {
      asserts.assertThrows(
        () =>
          new HookedRESTler(
            { headerProvider: 'nope' as unknown as RESTlerHeaderProvider },
          ),
        RESTlerConfigError,
        'headerProvider',
      );
    });
  });

  describe('witness', () => {
    it('wraps the request with span-style info; result passes through', async () => {
      const log: Array<{ kind: string; info?: WitnessInfo }> = [];
      const witness: Witness = async (info, fn) => {
        log.push({ kind: 'start', info });
        try {
          return await fn();
        } finally {
          log.push({ kind: 'end' });
        }
      };
      const client = new HookedRESTler({ witness });
      client.captureFetch({});

      const res = await client.get('/users/42');
      asserts.assertEquals(res.body?.ok, true);
      asserts.assertEquals(log[0]!.info!.name, 'restler.hooked GET');
      asserts.assertEquals(log[0]!.info!.attributes, {
        'restler.vendor': 'hooked',
        'http.request.method': 'GET',
        'url.path': '/users/42',
      });
      asserts.assertEquals(log.map((l) => l.kind), ['start', 'end']);
    });

    it('fires the headerProvider INSIDE the witnessed window (the propagation precondition)', async () => {
      const order: string[] = [];
      const client = new HookedRESTler({
        witness: async (_info, fn) => {
          order.push('witness:start');
          try {
            return await fn();
          } finally {
            order.push('witness:end');
          }
        },
        headerProvider: () => {
          order.push('provider');
          return {};
        },
      });
      client.captureFetch({});

      await client.get('/a');
      asserts.assertEquals(order, ['witness:start', 'provider', 'witness:end']);
    });

    it('propagates request errors through the witness unchanged', async () => {
      let sawLifecycle = 0;
      const client = new HookedRESTler({
        witness: async (_info, fn) => {
          sawLifecycle++;
          try {
            return await fn();
          } finally {
            sawLifecycle++;
          }
        },
      });
      client['_fetch'] = () => Promise.reject(new TypeError('fetch failed'));

      await asserts.assertRejects(() => client.get('/a'));
      asserts.assertEquals(sawLifecycle, 2);
    });

    it('rejects a non-function at construction', () => {
      asserts.assertThrows(
        () => new HookedRESTler({ witness: 'nope' as unknown as Witness }),
        RESTlerConfigError,
        'witness',
      );
    });

    it('behaves identically with no hooks configured', async () => {
      const client = new HookedRESTler();
      const sink: { headers?: Record<string, string> } = {};
      client.captureFetch(sink);
      const res = await client.get('/a');
      asserts.assertEquals(res.status, 200);
    });
  });
});
