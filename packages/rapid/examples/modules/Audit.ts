/**
 * An EVENT-ONLY module: no routes, no commands — it subscribes to what
 * `Posts` publishes. `app.modules()` still boots it (nothing to mount on
 * a transport, everything to wire on the bus). Each delivery carries the
 * originating request's id, so these log lines correlate with the HTTP
 * request that created or deleted the post.
 *
 * @module
 */
import { On } from '../../decorators/mod.ts';
import type {
  EventContext,
  RapidModuleEventPayload,
} from '../../modules/mod.ts';
import { BlogModule } from './BlogModule.ts';
import type { Posts } from './Posts.ts';

export class Audit extends BlogModule {
  readonly name = 'Audit';
  readonly namespace = 'audit';
  protected readonly events = {};
  /** What this module has seen — handy for tests and the dev dashboard. */
  readonly trail: { event: string; id: string; requestId: string }[] = [];

  @On('posts:Posts:PostCreated')
  created(
    { id, title }: RapidModuleEventPayload<Posts, 'PostCreated'>,
    ctx: EventContext,
  ) {
    this.trail.push({ event: ctx.event, id, requestId: ctx.requestId });
    this.log.info('post created', { id, title });
  }

  @On('posts:Posts:PostDeleted')
  deleted(
    { id }: RapidModuleEventPayload<Posts, 'PostDeleted'>,
    ctx: EventContext,
  ) {
    this.trail.push({ event: ctx.event, id, requestId: ctx.requestId });
    this.log.info('post deleted', { id });
  }
}
