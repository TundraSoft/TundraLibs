/**
 * @fileoverview One vendor client, one real request flow: BEARER auth, a
 * vendor-wide `{ ok, data, error }` envelope unwrapped by `_responseHandler`,
 * a `responseSchema` validating the unwrapped shape, `call`/`rateLimit`
 * event listeners, and typed error handling. No inline README snippet shows
 * all of these composing on the SAME client — this does.
 *
 * Self-contained: a tiny local HTTP server (via `@tundralibs/compat`'s
 * cross-runtime `WebServer`) plays the vendor, so this runs standalone with
 * no external network dependency.
 *
 * Run:
 *   deno run --allow-net packages/restler/examples/vendor-client.ts
 *   bun run packages/restler/examples/vendor-client.ts
 *   node --import tsx packages/restler/examples/vendor-client.ts
 *
 * @module
 */

import { WebServer } from '@tundralibs/compat/webserver';
import type { ServerHandler } from '@tundralibs/compat/webserver';
import {
  RESTler,
  RESTlerError,
  RESTlerRequestError,
  RESTlerResponseValidationError,
} from '@tundralibs/restler';
import type { RESTlerResponseHandler } from '@tundralibs/restler';

type Envelope = { ok: boolean; data?: unknown; error?: string };
type Account = { id: string; balance: number };

const validateAccount = (data: unknown): Account => {
  const d = data as Account;
  if (typeof d?.id !== 'string' || typeof d?.balance !== 'number') {
    throw new Error('malformed account payload');
  }
  return d;
};

// --- The "vendor": a tiny local server standing in for a real payments API.
// Three endpoints exercise the three paths a real vendor client has to
// handle: a normal envelope, a vendor error reported INSIDE a 200, and a 429.
const handler: ServerHandler = (req) => {
  const url = new URL(req.url);
  const json = (body: Envelope, status = 200, headers: HeadersInit = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });

  if (url.pathname === '/accounts/acct_1/balance') {
    return json({ ok: true, data: { id: 'acct_1', balance: 4200 } });
  }
  if (url.pathname === '/accounts/missing/balance') {
    return json({ ok: false, error: 'no such account' });
  }
  if (url.pathname === '/accounts/rate-limited/balance') {
    return new Response('', {
      status: 429,
      headers: {
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '60',
      },
    });
  }
  return new Response('Not Found', { status: 404 });
};

const server = new WebServer('payments-vendor', {
  mode: 'TCP',
  port: 0, // let the OS pick a free port
  handler,
});
await server.start();

// --- The vendor client -------------------------------------------------

class PaymentAPI extends RESTler {
  public readonly vendor = 'payments';

  // Every endpoint of this vendor shares the same envelope convention, so
  // it's declared once here rather than per-call.
  protected override _responseHandler: RESTlerResponseHandler = (response) => {
    const body = response.body as Envelope;
    if (body?.ok === false) {
      throw new RESTlerRequestError(`Vendor error: ${body.error}`, {
        vendor: this.vendor,
        request: { url: response.url, method: 'GET', timeout: 30 },
      });
    }
    return body?.data;
  };

  constructor(baseURL: string) {
    super({ baseURL, auth: { type: 'BEARER', token: 'demo-token' } });
  }

  getBalance(account: string) {
    return this._makeRequest(
      { path: `/accounts/${account}/balance`, method: 'GET' },
      // Runtime-validates the shape `_responseHandler` already unwrapped —
      // composes with it rather than replacing it.
      { responseSchema: validateAccount },
    );
  }

  /**
   * A per-call `responseHandler` overrides the class default ENTIRELY (see
   * the README's Vendor Response Handling section) — here that means the
   * envelope is no longer unwrapped, so the raw `{ ok, data }` shape reaches
   * `responseSchema`, which rejects it as malformed.
   */
  getBalanceRaw(account: string) {
    return this._makeRequest(
      { path: `/accounts/${account}/balance`, method: 'GET' },
      { responseHandler: (r) => r.body, responseSchema: validateAccount },
    );
  }

  /** No `responseSchema` — a plain status check, unopinionated about body shape. */
  checkStatus(account: string) {
    return this._makeRequest({
      path: `/accounts/${account}/balance`,
      method: 'GET',
    });
  }
}

const api = new PaymentAPI(`http://localhost:${server.port}`);

api.on('call', (vendor, request, response) => {
  console.log(
    `[${vendor}] ${request.method} ${request.url} -> ${response.status}`,
  );
});
api.on('rateLimit', (vendor, limit, reset, remaining) => {
  console.log(
    `[${vendor}] rate limited: ${remaining}/${limit}, resets in ${reset}s`,
  );
});

// 1. Happy path: BEARER auth + envelope unwrap + schema validation, all on
//    one call.
const ok = await api.getBalance('acct_1');
console.log('balance:', ok.body);

// 2. Vendor error reported INSIDE a 200 — `_responseHandler` throws, and the
//    request rejects instead of resolving with a misleading "success".
try {
  await api.getBalance('missing');
} catch (err) {
  if (err instanceof RESTlerError) console.log('vendor error:', err.message);
}

// 3. Rate limiting — a 429 resolves normally (inspect `status`, no throw)
//    and separately fires the `rateLimit` event read above.
const limited = await api.checkStatus('rate-limited');
console.log('rate-limited status:', limited.status);

// 4. A response that DOES arrive successfully but fails the schema —
//    surfaces as RESTlerResponseValidationError, distinct from both a
//    vendor error and a transport failure.
try {
  await api.getBalanceRaw('acct_1');
} catch (err) {
  if (err instanceof RESTlerResponseValidationError) {
    console.log('schema rejected it:', (err.cause as Error)?.message);
  }
}

await server.stop();
