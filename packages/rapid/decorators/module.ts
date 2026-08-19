/**
 * @fileoverview `@Module` — declare a class's `@GET`/`@SOCKET`/`@JOB`
 * methods as belonging together, with an optional HTTP path prefix.
 * METADATA-ONLY (TC39 standard): returns `undefined`, never replaces
 * the class. `@Module` is OPT-IN — a class with no `@Module` at all is
 * still mountable via `app.module()`; it just has no prefix.
 *
 * Method decorators apply BEFORE the class decorator (TC39: elements
 * first, then the class), so by the time this runs, every decorated
 * method on the class has already recorded into the side-table —
 * `@Module` only records the class-level metadata alongside it.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidModuleMeta } from '../types/mod.ts';
import { assertClassContext, recordModule } from './registry.ts';

/** Options for {@link Module}. */
export type ModuleDecoratorOptions = {
  /**
   * Joined onto every HTTP path declared in the class — socket
   * commands and job names are flat namespaces and ignore it. Must be
   * empty or start with `/`; validated NOW (decoration time), same as
   * `@JOB`'s schedule — a bad prefix fails at import, the loudest
   * possible moment, rather than as a confusing joined-path error
   * later at `app.module()`.
   */
  prefix?: string;
};

/**
 * Declare the decorated class a module: its `@GET`/`@SOCKET`/`@JOB`
 * methods mount together when an instance is passed to
 * `app.module()`.
 *
 * ```typescript
 * @Module({ prefix: '/users' })
 * class Users {
 *   constructor(private readonly db: Db) {}
 *
 *   @GET('/:id:', { bind: [param('id')] })
 *   find(id: string): RapidContextResponse { ... }
 * }
 *
 * app.module(new Users(db));
 * ```
 *
 * @throws {RapidError} RAPID_CONFIG when `prefix` is non-empty and
 *   does not start with `/`, or at decoration time under legacy
 *   decorator compilation.
 */
export function Module(
  options: ModuleDecoratorOptions = {},
): <Class extends abstract new (...args: never[]) => unknown>(
  target: Class,
  context: ClassDecoratorContext<Class>,
) => void {
  const prefix = options.prefix ?? '';
  if (prefix !== '' && !prefix.startsWith('/')) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `@Module prefix must be empty or start with '/' — got '${prefix}'`,
      details: { prefix },
    });
  }
  const meta: RapidModuleMeta = { prefix };
  return (target, context): void => {
    assertClassContext(context, 'Module');
    recordModule(target, meta);
  };
}
