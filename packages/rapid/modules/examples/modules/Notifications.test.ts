/**
 * Notifications — assert on the stocked Mailer; one failing subscriber
 * never breaks the emitter.
 * @module
 */
import { beforeEach, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { initModules } from '../../mod.ts';
import * as mods from './mod.ts';
import { freshServices, TEST } from '../testing.ts';

describe('example.Notifications', () => {
  let mailer: ReturnType<typeof freshServices>['mailer'];
  beforeEach(() => {
    ({ mailer } = freshServices());
  });

  it('sends a welcome mail on UserRegistered (fire-and-forget → drain)', async () => {
    const { modules: { Users }, runtime } = await initModules(TEST, {
      modules: [mods],
    });
    Users.register('new@example.com');
    asserts.assertEquals(mailer.sent, []); // async send — not yet
    await runtime.drain();
    asserts.assertEquals(mailer.sent, [{
      to: 'new@example.com',
      subject: 'Welcome!',
    }]);
    await runtime.dispose();
  });

  it('a throwing handler is isolated: the comment is saved, audit still records, failure is logged', async () => {
    const { modules: { Users, Posts, Comments, Audit }, runtime } =
      await initModules(TEST, { modules: [mods] });
    const logged: string[] = [];
    (runtime.log as unknown as { error: (m: string) => void }).error = (m) => {
      logged.push(m);
    };
    const post = Posts.create(Users.register('a@b.c').id, 'P');
    const comment = await Comments.add(post.id, 'troll', 'first!');
    asserts.assertEquals(comment.id, 1);
    asserts.assert(
      Audit.entries.some((e) => e.event === 'comments:Comments:CommentAdded'),
    );
    asserts.assertEquals(logged, ['moderation service unavailable']);
    await runtime.drain();
    asserts.assertEquals(mailer.sent.length, 1); // only the welcome mail — onComment never sent
    await runtime.dispose();
  });
});
