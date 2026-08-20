/**
 * @fileoverview healthCheck — liveness/readiness endpoint.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Application } from '../Application.ts';
import { healthCheck } from './healthCheck.ts';

const run = async (mw: ReturnType<typeof healthCheck>, path: string) => {
  const app = new Application({
    name: 'health',
    server: { port: 0, hostname: '127.0.0.1' },
  });
  app.use(mw);
  app.get('/other', () => ({ content: { route: true } }));
  await app.start();
  try {
    const r = await fetch(`http://127.0.0.1:${app.port}${path}`);
    return { status: r.status, body: await r.json() };
  } finally {
    await app.stop();
  }
};

describe('rapid.middlewares.healthCheck', () => {
  it('answers /health with 200 { status: ok }', async () => {
    asserts.assertEquals(await run(healthCheck(), '/health'), {
      status: 200,
      body: { status: 'ok' },
    });
  });

  it('merges a readiness check payload', async () => {
    const r = await run(
      healthCheck({ check: () => ({ db: 'up' }) }),
      '/health',
    );
    asserts.assertEquals(r, { status: 200, body: { status: 'ok', db: 'up' } });
  });

  it('a throwing check → 503 unhealthy', async () => {
    const r = await run(
      healthCheck({
        check: () => {
          throw new Error('db down');
        },
      }),
      '/health',
    );
    asserts.assertEquals(r, { status: 503, body: { status: 'unhealthy' } });
  });

  it('falls through for other paths', async () => {
    const r = await run(healthCheck(), '/other');
    asserts.assertEquals(r, { status: 200, body: { route: true } });
  });
});
