/**
 * Notifications — a SUBSCRIBER-ONLY module (emits nothing). One handler
 * deliberately fails for a "troll" author to show isolation: the comment
 * is still saved, other subscribers still run, the failure is logged.
 * Payload types come from the publishers' declarations via a TYPE-ONLY
 * import (erased — no runtime cycle).
 * @module
 */
import { On, type RapidModuleEventPayload } from '../../mod.ts';
import { AppModule } from '../AppModule.ts';
import type { Comments } from './Comments.ts';
import type { Posts } from './Posts.ts';
import type { Users } from './Users.ts';

export class Notifications extends AppModule {
  readonly name = 'Notifications';
  readonly namespace = 'notify';
  readonly events = {};

  @On('users:Users:UserRegistered')
  welcome({ email }: RapidModuleEventPayload<Users, 'UserRegistered'>) {
    this.mailer.send(email, 'Welcome!');
  }

  @On('posts:Posts:PostPublished')
  announce({ title }: RapidModuleEventPayload<Posts, 'PostPublished'>) {
    this.mailer.send('followers@example.com', `New post: ${title}`);
  }

  @On('comments:Comments:CommentAdded')
  onComment(
    { author, postId }: RapidModuleEventPayload<Comments, 'CommentAdded'>,
  ) {
    if (author === 'troll') throw new Error('moderation service unavailable');
    this.mailer.send('author@example.com', `New comment on ${postId}`);
  }
}
