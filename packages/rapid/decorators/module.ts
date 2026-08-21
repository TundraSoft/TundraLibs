/**
 * @fileoverview `@Module` — declare a class's `@GET`/`@SOCKET`/`@JOB`
 * methods as belonging together, with an identity, an optional HTTP
 * path prefix, an optional socket/job namespace, and an optional
 * default route version. METADATA-ONLY (TC39 standard): returns
 * `undefined`, never replaces the class. `@Module` is OPT-IN — a class
 * with no `@Module` at all is still mountable via `app.module()`; it
 * just has no name/prefix/namespace/version.
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
   * Joined onto every SOCKET command and JOB name declared in the
   * class, `{namespace}.{command|name}` — the collision-avoidance
   * mechanism for those two flat namespaces, mirroring what `prefix`
   * already gives HTTP paths (which ignore this).
   */
  namespace?: string;
  /**
   * Joined onto every HTTP path declared in the class — socket
   * commands and job names use {@link namespace} instead. Must be
   * empty or start with `/`; validated NOW (decoration time), same as
   * `@JOB`'s schedule — a bad prefix fails at import, the loudest
   * possible moment, rather than as a confusing joined-path error
   * later at `app.module()`.
   */
  prefix?: string;
  /**
   * Default `version` for every `@GET`/`@POST`/… in the class that
   * doesn't declare its own — an explicit per-method `version` always
   * wins.
   */
  version?: string;
};

/** The options-only form's options: identity comes from the module's fields. */
export type ModuleMountOptions = Pick<
  ModuleDecoratorOptions,
  'prefix' | 'version'
>;

type ModuleClassDecorator = <
  Class extends abstract new (...args: never[]) => unknown,
>(
  target: Class,
  context: ClassDecoratorContext<Class>,
) => void;

/**
 * Options-only form, for `RapidModule` subclasses: `name`/`namespace` are
 * the module's own fields (single source of truth — declaring them here
 * too is a RAPID_CONFIG mount error); the decorator adds the HTTP
 * `prefix` and the default route `version`, both optional.
 */
export function Module(options?: ModuleMountOptions): ModuleClassDecorator;
/**
 * Named form, for plain decorated classes: declare the class a module
 * whose `@GET`/`@SOCKET`/`@JOB` methods mount together when an instance
 * is passed to `app.module()`. `name` + optional `namespace` (flat
 * SOCKET/JOB names), `prefix` (HTTP paths only), `version`.
 *
 * ```typescript
 * import { GET, Module, param, type RapidContextResponse } from '@tundralibs/rapid';
 *
 * @Module('Users', { prefix: '/users' })
 * class Users {
 *   @GET('/:id:', { bind: [param('id')] })
 *   find(id: string): RapidContextResponse {
 *     return { content: { id } };
 *   }
 * }
 * ```
 *
 * @param name - The module's identity (diagnostics, future OpenAPI
 *   tagging) — required, unlike everything in `options`.
 * @throws {RapidError} RAPID_CONFIG when `name` is empty, `prefix` is
 *   non-empty and does not start with `/`, or at decoration time
 *   under legacy decorator compilation.
 */
export function Module(
  name: string,
  options?: ModuleDecoratorOptions,
): ModuleClassDecorator;
export function Module(
  nameOrOptions: string | ModuleMountOptions = {},
  options: ModuleDecoratorOptions = {},
): ModuleClassDecorator {
  const named = typeof nameOrOptions === 'string';
  const name = named ? nameOrOptions : undefined;
  const opts: ModuleDecoratorOptions = named ? options : nameOrOptions;
  if (named && name!.trim() === '') {
    throw new RapidError('RAPID_CONFIG', {
      message: '@Module name must be a non-empty string',
    });
  }
  const prefix = opts.prefix ?? '';
  if (prefix !== '' && !prefix.startsWith('/')) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `@Module prefix must be empty or start with '/' — got '${prefix}'`,
      details: { name, prefix },
    });
  }
  const meta: RapidModuleMeta = {
    ...(name !== undefined ? { name } : {}),
    prefix,
    ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
    ...(opts.version !== undefined ? { version: opts.version } : {}),
  };
  return (target, context): void => {
    assertClassContext(context, 'Module');
    recordModule(target, meta);
  };
}
