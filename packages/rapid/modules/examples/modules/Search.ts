/**
 * Search — maintains an index from events, answers queries with a plain
 * method, and holds a DIRECT module-to-module dependency on Audit
 * (safe because Audit is doctor-registered: one instance, shared).
 * @module
 */
import { inject } from '@tundralibs/doctor';
import { On, type RapidModuleEventPayload } from '../../mod.ts';
import { AppModule } from '../AppModule.ts';
import { Audit } from './Audit.ts';
import type { Posts } from './Posts.ts';

export class Search extends AppModule {
  readonly name = 'Search';
  readonly namespace = 'search';
  readonly events = {};
  private readonly __index = new Map<string, string>();
  private readonly __audit = inject(Audit);

  @On('posts:Posts:PostPublished')
  index({ id, title }: RapidModuleEventPayload<Posts, 'PostPublished'>) {
    this.__index.set(id, title.toLowerCase());
  }

  @On('posts:Posts:PostRemoved')
  drop({ id }: RapidModuleEventPayload<Posts, 'PostRemoved'>) {
    this.__index.delete(id);
  }

  query(term: string): string[] {
    const t = term.toLowerCase();
    return [...this.__index].filter(([, title]) => title.includes(t)).map((
      [id],
    ) => id);
  }

  /** Proves the injected Audit IS the mounted one. */
  auditedEvents(): number {
    return this.__audit.entries.length;
  }
}
