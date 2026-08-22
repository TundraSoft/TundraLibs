/**
 * @fileoverview cors — origin resolution, credentials, preflight
 * short-circuit, disallowed-origin posture, and error-path survival.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from '../Application.ts';
import { cors, type CorsOptions } from './cors.ts';

const spin = async (options?: CorsOptions) => {
  const app = await Application.initialize({
    name: 'cors',
    server: { port: 0 },
  });
  app.use(cors(options));
  app.get('/r', () => ({ content: 'ok' }));
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  await app.start();
  return { app, base: `http://localhost:${app.port}` };
};

describe('rapid.middlewares.cors', () => {
  it('default wildcard; no Origin header → untouched', async () => {
    const { app, base } = await spin();
    try {
      const plain = await fetch(`${base}/r`);
      await plain.text();
      asserts.assertEquals(
        plain.headers.get('access-control-allow-origin'),
        null,
      );
      const crossed = await fetch(`${base}/r`, {
        headers: { origin: 'https://a.example' },
      });
      await crossed.text();
      asserts.assertEquals(
        crossed.headers.get('access-control-allow-origin'),
        '*',
      );
    } finally {
      await app.stop();
    }
  });

  it('origin list allows exactly; disallowed = no headers, NOT an error', async () => {
    const { app, base } = await spin({ origin: ['https://ok.example'] });
    try {
      const good = await fetch(`${base}/r`, {
        headers: { origin: 'https://ok.example' },
      });
      await good.text();
      asserts.assertEquals(
        good.headers.get('access-control-allow-origin'),
        'https://ok.example',
      );
      asserts.assertEquals(good.headers.get('vary'), 'origin');
      const bad = await fetch(`${base}/r`, {
        headers: { origin: 'https://evil.example' },
      });
      await bad.text();
      asserts.assertEquals(bad.status, 200); // browser enforces, not us
      asserts.assertEquals(
        bad.headers.get('access-control-allow-origin'),
        null,
      );
    } finally {
      await app.stop();
    }
  });

  it('credentials echo the origin instead of the wildcard', async () => {
    const { app, base } = await spin({ credentials: true });
    try {
      const r = await fetch(`${base}/r`, {
        headers: { origin: 'https://a.example' },
      });
      await r.text();
      asserts.assertEquals(
        r.headers.get('access-control-allow-origin'),
        'https://a.example',
      );
      asserts.assertEquals(
        r.headers.get('access-control-allow-credentials'),
        'true',
      );
    } finally {
      await app.stop();
    }
  });

  it('preflight: 204 short-circuit with methods/headers/max-age', async () => {
    const { app, base } = await spin({
      origin: ['https://ok.example'],
      maxAge: 600,
    });
    try {
      const pre = await fetch(`${base}/r`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://ok.example',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-thing',
        },
      });
      await pre.text();
      asserts.assertEquals(pre.status, 204);
      asserts.assert(
        pre.headers.get('access-control-allow-methods')!.includes('POST'),
      );
      // Default REFLECTS the requested headers:
      asserts.assertEquals(
        pre.headers.get('access-control-allow-headers'),
        'content-type,x-thing',
      );
      asserts.assertEquals(pre.headers.get('access-control-max-age'), '600');
      // Disallowed preflight: still 204, but bare:
      const deny = await fetch(`${base}/r`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'POST',
        },
      });
      await deny.text();
      asserts.assertEquals(deny.status, 204);
      asserts.assertEquals(
        deny.headers.get('access-control-allow-origin'),
        null,
      );
    } finally {
      await app.stop();
    }
  });

  it('CORS headers survive error overrides (browsers can read the 500)', async () => {
    const { app, base } = await spin();
    try {
      const r = await fetch(`${base}/boom`, {
        headers: { origin: 'https://a.example' },
      });
      await r.text();
      asserts.assertEquals(r.status, 500);
      asserts.assertEquals(
        r.headers.get('access-control-allow-origin'),
        '*',
      );
    } finally {
      await app.stop();
    }
  });

  it('exact-STRING origin allows the match; a mismatch gets no allow-origin', async () => {
    const { app, base } = await spin({ origin: 'https://ok.example' });
    try {
      const good = await fetch(`${base}/r`, {
        headers: { origin: 'https://ok.example' },
      });
      await good.text();
      asserts.assertEquals(
        good.headers.get('access-control-allow-origin'),
        'https://ok.example',
      );
      const bad = await fetch(`${base}/r`, {
        headers: { origin: 'https://ok.example.evil' },
      });
      await bad.text();
      asserts.assertEquals(
        bad.headers.get('access-control-allow-origin'),
        null,
      );
    } finally {
      await app.stop();
    }
  });

  it('PREDICATE origin allows/denies by the function', async () => {
    const { app, base } = await spin({
      origin: (o) => o.endsWith('.trusted'),
    });
    try {
      const good = await fetch(`${base}/r`, {
        headers: { origin: 'https://a.trusted' },
      });
      await good.text();
      asserts.assertEquals(
        good.headers.get('access-control-allow-origin'),
        'https://a.trusted',
      );
      const bad = await fetch(`${base}/r`, {
        headers: { origin: 'https://a.untrusted' },
      });
      await bad.text();
      asserts.assertEquals(
        bad.headers.get('access-control-allow-origin'),
        null,
      );
    } finally {
      await app.stop();
    }
  });

  it('exposedHeaders → access-control-expose-headers on the actual response', async () => {
    const { app, base } = await spin({
      origin: ['https://ok.example'],
      exposedHeaders: ['x-total-count', 'x-page'],
    });
    try {
      const r = await fetch(`${base}/r`, {
        headers: { origin: 'https://ok.example' },
      });
      await r.text();
      asserts.assertEquals(
        r.headers.get('access-control-expose-headers'),
        'x-total-count, x-page',
      );
      // A disallowed origin gets no expose-headers.
      const bad = await fetch(`${base}/r`, {
        headers: { origin: 'https://evil.example' },
      });
      await bad.text();
      asserts.assertEquals(
        bad.headers.get('access-control-expose-headers'),
        null,
      );
    } finally {
      await app.stop();
    }
  });

  it('appends origin to a pre-existing Vary without clobbering it', async () => {
    const app = await Application.initialize({
      name: 'cors-vary',
      server: { port: 0 },
    });
    // A middleware BEFORE cors stamps the app's own Vary; cors must append,
    // not replace, so the shared cache still keys on both.
    app.use((ctx, next) => {
      if (ctx.type === 'HTTP') ctx.setHeader('vary', 'accept-encoding');
      return next();
    });
    app.use(cors({ origin: ['https://ok.example'] }));
    app.get('/r', () => ({ content: 'ok' }));
    await app.start();
    const base = `http://localhost:${app.port}`;
    try {
      const r = await fetch(`${base}/r`, {
        headers: { origin: 'https://ok.example' },
      });
      await r.text();
      asserts.assertEquals(
        r.headers.get('vary'),
        'accept-encoding, origin',
      );
    } finally {
      await app.stop();
    }
  });

  it('does not duplicate origin when Vary already lists it', async () => {
    const app = await Application.initialize({
      name: 'cors-vary2',
      server: { port: 0 },
    });
    // A prior middleware already listed origin (any casing) → cors leaves
    // the Vary untouched (no dup).
    app.use((ctx, next) => {
      if (ctx.type === 'HTTP') ctx.setHeader('vary', 'Origin');
      return next();
    });
    app.use(cors({ origin: ['https://ok.example'] }));
    app.get('/r', () => ({ content: 'ok' }));
    await app.start();
    const base = `http://localhost:${app.port}`;
    try {
      const r = await fetch(`${base}/r`, {
        headers: { origin: 'https://ok.example' },
      });
      await r.text();
      const vary = r.headers.get('vary')!;
      asserts.assertEquals(
        vary.split(',').filter((p) => p.trim().toLowerCase() === 'origin')
          .length,
        1,
      );
    } finally {
      await app.stop();
    }
  });
});
