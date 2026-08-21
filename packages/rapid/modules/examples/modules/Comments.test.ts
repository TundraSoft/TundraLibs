/**
 * Comments — delegation through `invoke` and the caller-principal rule.
 * @module
 */
import { beforeEach, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { initModules } from '../../mod.ts';
import * as mods from './mod.ts';
import { freshServices, TEST } from '../testing.ts';

describe('example.Comments', () => {
  beforeEach(() => {
    freshServices();
  });

  it('purgeThread delegates to Posts.remove and is refused for a non-admin caller', async () => {
    const { modules: { Users, Posts, Comments }, runtime } = await initModules(
      TEST,
      { modules: [mods] },
    );
    (runtime.log as unknown as { error: () => void }).error = () => {};
    const post = Posts.create(Users.register('a@b.c').id, 'Thread');
    await Comments.add(post.id, 'bob', 'hi');

    const asMember = await runtime.invoke(mods.Comments, 'purgeThread', [
      post.id,
    ], {
      state: { principal: { id: 'm', role: 'member' } },
    });
    asserts.assertEquals(asMember.content, { status: 403, purged: 0 });
    asserts.assertEquals(Comments.forPost(post.id).length, 1); // untouched

    const asAdmin = await runtime.invoke(mods.Comments, 'purgeThread', [
      post.id,
    ], {
      state: { principal: { id: 'a', role: 'admin' } },
    });
    asserts.assertEquals(asAdmin.content, { status: 200, purged: 1 });
    asserts.assertEquals(Comments.forPost(post.id).length, 0);
  });

  it('add() on a missing post is a 404 envelope when invoked, a throw when called', async () => {
    const { modules: { Comments }, runtime } = await initModules(TEST, {
      modules: [mods],
    });
    (runtime.log as unknown as { error: () => void }).error = () => {};
    const res = await runtime.invoke(mods.Comments, 'add', ['nope', 'x', 'y']);
    asserts.assertEquals(res.status, 404);
    await asserts.assertRejects(() => Comments.add('nope', 'x', 'y'));
  });
});
