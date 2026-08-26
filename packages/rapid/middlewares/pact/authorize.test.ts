/**
 * @fileoverview Tests for `authorize(module, permission)` — the pact
 * permission check, over `app.fetch`.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor } from '@tundralibs/doctor';
import type { PactStoredApiKey, PactStoredUser } from '@tundralibs/pact';
import { Application } from '../../Application.ts';
import { authenticate as byoAuthenticate } from '../auth.ts';
import { authenticate } from './authenticate.ts';
import { authorize } from './authorize.ts';
import { PACT, pact } from './pact.ts';

const make = () =>
  Application.initialize({
    name: 'pact-authorize-test',
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
    uploads: { path: '/tmp/rapid-pact-authorize-test' },
  });

function setup(grants: Record<string, string>) {
  const users = new Map<string, PactStoredUser>();
  const apiKeys = new Map<string, PactStoredApiKey>();
  users.set('u1', { id: 'u1', status: 'ACTIVE', grants });
  return pact({
    bits: { READ: 1n, WRITE: 2n },
    modules: { Post: ['READ', 'WRITE'] },
    apiKeys: true,
    apiKey: {},
    hooks: {
      getUser: (q: { by: string; id?: string }) =>
        q.by === 'ID' ? users.get(q.id!) ?? null : null,
      getApiKey: (id: string) => apiKeys.get(id) ?? null,
      saveApiKey: (r: PactStoredApiKey) => {
        apiKeys.set(r.id, r);
      },
    },
  });
}

describe('rapid.middlewares.pact.authorize', () => {
  it('401 when anonymous', async () => {
    Doctor.revoke(PACT);
    setup({ Post: '3' });

    const app = await make();
    app.get('/posts', authorize('Post', 'READ'), () => ({ content: 'ok' }));
    const res = await app.fetch(new Request('http://app/posts'));
    asserts.assertEquals(res.status, 401);
    await app.stop();
  });

  it('200 when the principal holds the permission on the module', async () => {
    Doctor.revoke(PACT);
    const instance = setup({ Post: '3' }); // READ|WRITE
    const { id, secret } = await instance.issueApiKey('u1');

    const app = await make();
    app.use(authenticate());
    app.get('/posts', authorize('Post', 'READ'), () => ({ content: 'ok' }));
    const res = await app.fetch(
      new Request('http://app/posts', {
        headers: { 'x-api-key': id, 'x-api-secret': secret },
      }),
    );
    asserts.assertEquals(res.status, 200);
    await app.stop();
  });

  it('403 when authenticated but lacking the permission', async () => {
    Doctor.revoke(PACT);
    const instance = setup({ Post: '1' }); // READ only
    const { id, secret } = await instance.issueApiKey('u1');

    const app = await make();
    app.use(authenticate());
    app.post('/posts', authorize('Post', 'WRITE'), () => ({ content: 'ok' }));
    const res = await app.fetch(
      new Request('http://app/posts', {
        method: 'POST',
        headers: { 'x-api-key': id, 'x-api-secret': secret },
      }),
    );
    asserts.assertEquals(res.status, 403);
    await app.stop();
  });

  it('checks (module, permission) in that order — not swapped', async () => {
    Doctor.revoke(PACT);
    // A principal with WRITE on Post only. authorize('Post', 'WRITE') must
    // pass; authorize('WRITE', 'Post') — the args flipped — must NOT,
    // proving the wiring reads (module, permission) and not the reverse.
    const instance = setup({ Post: '2' }); // WRITE only
    const { id, secret } = await instance.issueApiKey('u1');

    const app = await make();
    app.use(authenticate());
    app.get(
      '/right-order',
      authorize('Post', 'WRITE'),
      () => ({ content: 'ok' }),
    );
    app.get(
      '/wrong-order',
      authorize('WRITE', 'Post'),
      () => ({ content: 'ok' }),
    );
    const creds = { headers: { 'x-api-key': id, 'x-api-secret': secret } };

    asserts.assertEquals(
      (await app.fetch(new Request('http://app/right-order', creds))).status,
      200,
    );
    // 'WRITE' as a module / 'Post' as a permission is not a registered
    // module in the catalog — Permissions.has throws UNKNOWN_MODULE, which
    // propagates as a 500 rather than a clean 403; either way it must NOT
    // be a 200.
    const wrong = await app.fetch(new Request('http://app/wrong-order', creds));
    asserts.assertNotEquals(wrong.status, 200);

    await app.stop();
  });

  it('403s (not a crash) when ctx.auth was set without a grants field', async () => {
    Doctor.revoke(PACT);
    setup({ Post: '3' }); // registers PACT; this route never authenticates via it

    const app = await make();
    // A BYO auth bag — no `grants` key, unlike a real PactPrincipal.
    app.use(
      byoAuthenticate({
        verify: (t) => t === 'x' ? { id: 'u1', status: 'ACTIVE' } : null,
      }),
    );
    app.get('/posts', authorize('Post', 'READ'), () => ({ content: 'ok' }));

    const res = await app.fetch(
      new Request('http://app/posts', {
        headers: { authorization: 'Bearer x' },
      }),
    );
    asserts.assertEquals(res.status, 403);

    await app.stop();
  });
});
