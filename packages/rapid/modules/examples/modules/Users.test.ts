/**
 * Users — guards bite only through `invoke`; a direct call is a plain
 * method (trusted code). Both halves asserted, honestly.
 * @module
 */
import { beforeEach, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { initModules } from '../../mod.ts';
import * as mods from './mod.ts';
import { freshServices, TEST } from '../testing.ts';

describe('example.Users', () => {
  beforeEach(() => {
    freshServices();
  });

  it('promote: 401 without a principal, 403 for a member, 200 for an admin — when invoked', async () => {
    const { modules: { Users }, runtime } = await initModules(TEST, {
      modules: [mods],
    });
    const user = Users.register('a@b.c');
    const anon = await runtime.invoke(mods.Users, 'promote', [
      user.id,
      'editor',
    ]);
    asserts.assertEquals(anon.status, 401);
    const member = await runtime.invoke(mods.Users, 'promote', [
      user.id,
      'editor',
    ], {
      state: { principal: { id: 'm', role: 'member' } },
    });
    asserts.assertEquals(member.status, 403);
    const admin = await runtime.invoke(mods.Users, 'promote', [
      user.id,
      'editor',
    ], {
      state: { principal: { id: 'a', role: 'admin' } },
    });
    asserts.assertEquals([
      admin.status,
      (admin.content as { role: string }).role,
    ], [200, 'editor']);
    await runtime.dispose();
  });

  it('promote called DIRECTLY runs no guard — trusted code calling trusted code', async () => {
    const { modules: { Users }, runtime } = await initModules(TEST, {
      modules: [mods],
    });
    const user = Users.register('a@b.c');
    asserts.assertEquals(Users.promote(user.id, 'admin').role, 'admin');
    await runtime.dispose();
  });
});
