/**
 * @fileoverview HTTPTransport — the DEV-only response contract: a
 * parse-capable declared `response` schema is enforced against the
 * return-channel reply in DEVELOPMENT and never touched in PRODUCTION.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';

const make = (mode: 'DEVELOPMENT' | 'PRODUCTION') =>
  Application.initialize({
    name: 'response-contract',
    mode,
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
  });

/**
 * A guardian-shaped schema double: counts `parse` calls, optionally
 * fails with a `leafErrors()`-carrying error (what the recognizer reads).
 */
const schemaDouble = (outcome: 'pass' | 'fail' | 'transform') => {
  const calls = { parse: 0 };
  return {
    calls,
    schema: {
      parse(value: unknown): unknown {
        calls.parse++;
        if (outcome === 'fail') {
          const err = new Error('shape mismatch') as Error & {
            leafErrors: () => unknown[];
          };
          err.leafErrors = () => [
            { path: ['total'], error: { message: 'must be a number' } },
          ];
          throw err;
        }
        return outcome === 'transform' ? { swapped: true } : value;
      },
      toOpenAPI: () => ({ type: 'object' }),
    },
  };
};

describe('rapid.HTTPTransport response contract', () => {
  it('DEVELOPMENT: a failing reply becomes RAPID_RESPONSE_INVALID (500) with the field detail', async () => {
    const app = await make('DEVELOPMENT');
    const { schema } = schemaDouble('fail');
    app.get('/x', { openapi: { response: schema } }, () => ({
      content: { total: 'NaN' },
    }));
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 500);
    const body = await res.json();
    asserts.assertEquals(body.code, 'RAPID_RESPONSE_INVALID');
    asserts.assertEquals(body.details.fields, { total: 'must be a number' });
    await app.stop();
  });

  it('DEVELOPMENT: a passing reply goes out unchanged — enforce-only, a transforming parse never rewrites it', async () => {
    const app = await make('DEVELOPMENT');
    const { schema, calls } = schemaDouble('transform');
    app.get('/x', { openapi: { response: schema } }, () => ({
      content: { total: 3 },
    }));
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 200);
    asserts.assertEquals(await res.json(), { total: 3 }); // NOT { swapped }
    asserts.assertEquals(calls.parse, 1);
    await app.stop();
  });

  it('PRODUCTION: the parse never runs', async () => {
    const app = await make('PRODUCTION');
    const { schema, calls } = schemaDouble('fail');
    app.get('/x', { openapi: { response: schema } }, () => ({
      content: { total: 'NaN' },
    }));
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 200);
    await res.body?.cancel();
    asserts.assertEquals(calls.parse, 0);
    await app.stop();
  });

  it('skips non-success shapes: error status, redirect, and a no-body reply', async () => {
    const app = await make('DEVELOPMENT');
    const { schema, calls } = schemaDouble('fail');
    const openapi = { response: schema };
    app.get('/error', { openapi }, () => ({
      status: 404,
      content: { missing: true },
    }));
    app.get('/redirect', { openapi }, () => ({
      content: '',
      redirect: '/elsewhere',
    }));
    app.get('/none', { openapi }, () => {}); // void → 204, nothing to check
    for (const path of ['/error', '/redirect', '/none']) {
      await (await app.fetch(new Request(`http://app${path}`))).body?.cancel();
    }
    asserts.assertEquals(calls.parse, 0);
    await app.stop();
  });

  it('an emitter-only response schema (no parse) stays documentation-only', async () => {
    const app = await make('DEVELOPMENT');
    app.get(
      '/x',
      { openapi: { response: { toOpenAPI: () => ({ type: 'object' }) } } },
      () => ({ content: { anything: 'goes' } }),
    );
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 200);
    await res.body?.cancel();
    await app.stop();
  });

  it('an async parse is awaited — its rejection is the same 500', async () => {
    const app = await make('DEVELOPMENT');
    app.get('/x', {
      openapi: {
        response: {
          parse: (value: unknown) =>
            (value as { ok: boolean }).ok
              ? Promise.resolve(value)
              : Promise.reject(new Error('async says no')),
        },
      },
    }, () => ({ content: { ok: false } }));
    const res = await app.fetch(new Request('http://app/x'));
    asserts.assertEquals(res.status, 500);
    const body = await res.json();
    asserts.assertEquals(body.code, 'RAPID_RESPONSE_INVALID');
    asserts.assertEquals(body.details.reason, 'async says no');
    await app.stop();
  });
});
