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
  protected readonly events = {};
  private readonly __index = new Map<string, string>();
  private readonly __audit = inject(Audit);

  @On('posts:Posts:PostPublished')
  async index({ id, title }: RapidModuleEventPayload<Posts, 'PostPublished'>) {
    await new Promise((resolve) => setTimeout(resolve, 1)); // simulated index I/O
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

  /** Identity check: is the injected Audit THE mounted instance? */
  usesAudit(audit: Audit): boolean {
    return this.__audit === audit;
  }
}
