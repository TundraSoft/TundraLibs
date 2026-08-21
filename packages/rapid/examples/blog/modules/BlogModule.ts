/**
 * The project's module base: everything a blog module needs beyond what
 * `RapidModule` already gives (`log`, `config`, `emit`, `invoke`) — here,
 * typed repos over the shared `Norm` pool, injected while the instance
 * constructs. Not exported from the barrel: bases are not modules.
 *
 * @module
 */
import { inject } from '@tundralibs/doctor';
import { RapidModule, type RapidModuleEventMap } from '../../../modules/mod.ts';
import { NORM } from '../di.ts';
import { BlogSchema } from '../models/mod.ts';

export abstract class BlogModule<
  E extends RapidModuleEventMap = Record<string, never>,
> extends RapidModule<E> {
  /** A typed handle over the shared connection pool. */
  protected readonly db = inject(NORM).use(BlogSchema);
}
