/**
 * Standard assert tests for one module — the shape every production
 * module test takes: fresh services, `initModules` with the barrel, then
 * plain calls / `runtime.invoke` / event observation.
 * @module
 */
import { beforeEach, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { RapidError } from '../../../errors/mod.ts';
import { initModules } from '../../mod.ts';
import * as mods from './mod.ts';
import { freshServices, TEST } from '../testing.ts';

describe('example.Posts', () => {
  beforeEach(() => {
    freshServices();
  });

  it('creates a post for an existing author and emits PostCreated', async () => {
    const { modules: { Users, Posts, Audit }, runtime } = await initModules(
      TEST,
      { modules: [mods] },
    );
    const user = Users.register('a@b.c');
    const post = Posts.create(user.id, 'Hello');
    await runtime.drain(); // fire-and-forget → wait for subscribers
    asserts.assertEquals(post.title, 'Hello');
    asserts.assert(
      Audit.entries.some((e) => e.event === 'posts:Posts:PostCreated'),
    );
    await runtime.dispose();
  });

  it('rejects an unknown author with RAPID_NOT_FOUND', async () => {
    const { modules: { Posts }, runtime } = await initModules(TEST, {
      modules: [mods],
    });
    asserts.assertThrows(
      () => Posts.create('nobody', 'x'),
      RapidError,
      'Not found',
    );
    await runtime.dispose();
  });

  it('publish AWAITS its emit: the (async) search index is populated when publish() returns', async () => {
    const { modules: { Users, Posts, Search }, runtime } = await initModules(
      TEST,
      { modules: [mods] },
    );
    const post = Posts.create(Users.register('a@b.c').id, 'Typed Events');
    await Posts.publish(post.id);
    asserts.assertEquals(Search.query('typed'), [post.id]); // no drain needed — publish waited
    await runtime.dispose();
  });

  it('publish is guarded when INVOKED (401 without a principal) and a plain method when called', async () => {
    const { modules: { Users, Posts }, runtime } = await initModules(TEST, {
      modules: [mods],
    });
    const post = Posts.create(Users.register('a@b.c').id, 'Guarded');
    asserts.assertEquals(
      (await runtime.invoke(mods.Posts, 'publish', [post.id])).status,
      401,
    );
    const ok = await runtime.invoke(mods.Posts, 'publish', [post.id], {
      state: { principal: { id: 'u', role: 'member' } },
    });
    asserts.assertEquals(ok.status, 200);
    asserts.assertEquals((await Posts.publish(post.id)).published, true); // direct: no guard
    await runtime.dispose();
  });
});
