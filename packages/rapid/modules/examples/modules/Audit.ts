/**
 * Audit — subscribes to EVERYTHING with one handler and records the
 * correlation id each delivery carried (the originating request's).
 * Also registered with doctor (`@Vial`) so Search can `inject()` it —
 * the runtime dispenses that same instance instead of constructing a
 * second one (single-instance rule). Has lifecycle hooks.
 * @module
 */
import { Vial } from '@tundralibs/doctor';
import { type EventContext, On } from '../../mod.ts';
import { AppModule } from '../AppModule.ts';

export type AuditEntry = { event: string; requestId: string };

@Vial('SINGLETON')
export class Audit extends AppModule {
  readonly name = 'Audit';
  readonly namespace = 'audit';
  readonly events = {};
  readonly entries: AuditEntry[] = [];

  @On(
    'users:Users:UserRegistered',
    'posts:Posts:PostCreated',
    'posts:Posts:PostPublished',
    'posts:Posts:PostRemoved',
    'comments:Comments:CommentAdded',
  )
  record(_payload: unknown, ctx: EventContext) {
    this.entries.push({ event: ctx.event, requestId: ctx.requestId });
  }

  init() {
    this.log.info('audit ready');
  }
  dispose() {
    this.log.info('audit flushed', { entries: this.entries.length });
  }
}
