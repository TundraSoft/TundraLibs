/**
 * @fileoverview The neutral core: verdict shapes, the shared challenge
 * (realm, off), the never-anonymous rule, and the call-site catalog check
 * on the typed guard.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { createPactMiddleware } from './core.ts';
import { Pact, PactError } from '../mod.ts';
import { serializeGrants } from '../grants.ts';

const pact = Pact.create({
  bits: { READ: 1n, EDIT: 2n },
  modulePermissions: { Post: ['READ', 'EDIT'], Admin: ['READ'] },
  hooks: {
    getApiKey: (id) => {
      if (id === 'boom') throw new TypeError('backend down');
      return id === 'k1'
        ? {
          id: 'k1',
          status: 'ACTIVE',
          secret: 's1',
          grants: serializeGrants({ Post: 1n }),
        }
        : null;
    },
  },
});

const req = (headers: Record<string, string> = {}) => ({
  method: 'GET',
  path: '/x',
  header: (name: string) => headers[name.toLowerCase()] ?? null,
});

describe('createPactMiddleware', () => {
  it('authenticates a valid credential, denies an invalid one, and never downgrades an invalid one to anonymous', async () => {
    const core = createPactMiddleware(pact, { optional: true });
    const ok = await core.authenticate(req({ authorization: 'ApiKey k1:s1' }));
    asserts.assert(ok.ok && ok.auth?.principal.id === 'k1');
    const none = await core.authenticate(req());
    asserts.assertEquals(none, { ok: true, auth: undefined });
    const bad = await core.authenticate(
      req({ authorization: 'ApiKey k1:wrong' }),
    );
    asserts.assert(!bad.ok);
    asserts.assertEquals(bad.denial.status, 401);
    asserts.assertEquals(bad.denial.body, { error: 'INVALID_CREDENTIALS' });
  });

  it('every 401 carries the shared WWW-Authenticate challenge — realm when set, nothing when challenges are off', async () => {
    const plain = createPactMiddleware(pact);
    asserts.assertEquals(plain.challenge, 'Bearer, Basic, ApiKey');
    const none = await plain.authenticate(req());
    asserts.assert(!none.ok);
    asserts.assertEquals(none.denial.headers, {
      'www-authenticate': 'Bearer, Basic, ApiKey',
    });

    const realm = createPactMiddleware(pact, {
      schemes: ['BEARER'],
      realm: 'api "quoted"',
      hmac: { canonical: (r) => r.path },
    });
    asserts.assertEquals(realm.challenge, 'Bearer realm="api quoted"');

    const off = createPactMiddleware(pact, { challenge: false });
    const denied = await off.authenticate(req());
    asserts.assert(!denied.ok);
    asserts.assertEquals(denied.denial.headers, {});
    // A 403 never carries a challenge.
    const guard = plain.authorize('Post', 'EDIT');
    const ok = await plain.authenticate(req({ authorization: 'ApiKey k1:s1' }));
    asserts.assert(ok.ok);
    const forbidden = await guard(ok.auth);
    asserts.assertEquals(forbidden?.status, 403);
    asserts.assertEquals(forbidden?.headers, {});
  });

  it('authorize: 401 without a context, 403 without the grant, undefined when held', async () => {
    const core = createPactMiddleware(pact);
    const read = core.authorize('Post', 'READ');
    const edit = core.authorize('Post', 'EDIT');
    const anon = await read(undefined);
    asserts.assertEquals(anon?.status, 401);
    asserts.assertEquals(anon?.body, { error: 'NO_CREDENTIALS' });
    const ok = await core.authenticate(req({ authorization: 'ApiKey k1:s1' }));
    asserts.assert(ok.ok);
    asserts.assertEquals(await read(ok.auth), undefined);
    asserts.assertEquals((await edit(ok.auth))?.body, {
      error: 'PERMISSION_DENIED',
    });
  });

  it('authorize checks the catalog when the guard is BUILT — a typo is a boot error, not a first-request surprise', () => {
    const core = createPactMiddleware(pact);
    asserts.assertThrows(
      () => core.authorize('Nope' as never, 'READ'),
      PactError,
      "Module 'Nope' is not defined",
    );
    asserts.assertThrows(
      () => core.authorize('Admin', 'EDIT'),
      PactError,
      "Permission 'EDIT' is not allowed for module 'Admin'",
    );
  });

  it('a non-pact error from a hook is THROWN, not turned into a verdict', async () => {
    const core = createPactMiddleware(pact);
    await asserts.assertRejects(
      () => core.authenticate(req({ authorization: 'ApiKey boom:x' })),
      TypeError,
      'backend down',
    );
  });
});
