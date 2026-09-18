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
import {
  assertClassContext,
  assertMiddlewareList,
  recordModule,
} from './registry.ts';

/**
 * One prefix, or several, normalised to an array. Each must be empty or
 * start with `/` — checked HERE, at decoration time, so a bad prefix
 * fails at import rather than as a confusing joined-path error at mount.
 *
 * @throws {RapidError} RAPID_CONFIG on a malformed prefix, or on an empty
 *   array — which would mount no routes at all, silently.
 */
function normalisePrefixes(
  name: string | undefined,
  prefix: string | readonly string[] | undefined,
): readonly string[] {
  if (prefix === undefined) return [''];
  const list = typeof prefix === 'string' ? [prefix] : [...prefix];
  if (list.length === 0) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        '@Module prefix cannot be an empty array — it would mount no routes; ' +
        "omit it, or pass '' for no prefix",
      details: { name },
    });
  }
  for (const entry of list) {
    if (typeof entry !== 'string') {
      throw new RapidError('RAPID_CONFIG', {
        message:
          `@Module prefix entries must be strings — got '${typeof entry}'`,
        details: { name, prefix: String(entry) },
      });
    }
    if (entry !== '' && !entry.startsWith('/')) {
      throw new RapidError('RAPID_CONFIG', {
        message:
          `@Module prefix must be empty or start with '/' — got '${entry}'`,
        details: { name, prefix: entry },
      });
    }
  }
  const unique = new Set(list);
  if (unique.size !== list.length) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        '@Module prefix entries must be unique — a repeat would mount every ' +
        'route on the same path twice',
      details: { name, prefix: list.join(', ') },
    });
  }
  return list;
}

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
   * commands and job names use {@link namespace} instead. Each must be
   * empty or start with `/`; validated NOW (decoration time), same as
   * `@JOB`'s schedule — a bad prefix fails at import, the loudest
   * possible moment, rather than as a confusing joined-path error
   * later at `app.module()`.
   *
   * An ARRAY mounts the class's whole route table once per prefix —
   * `['', '/:orgCode:']` serves every route both tenant-scoped and
   * unscoped from one declaration. An empty array is a loud error: it
   * would mount nothing. See {@link RapidModuleMeta.prefixes}.
   * @default ''
   */
  prefix?: string | readonly string[];
  /**
   * Default `version` for every `@GET`/`@POST`/… in the class that
   * doesn't declare its own — an explicit per-method `version` always
   * wins.
   */
  version?: string;
  /** Describes the module's tag in the OpenAPI document's top-level `tags`. */
  description?: string;
  /**
   * OpenAPI tags every route in the class carries (a route's own `tags`
   * are merged on top). An explicit `[]` opts out.
   * @default [name]
   */
  tags?: readonly string[];
  /**
   * Default security-scheme names for every route in the class; a route's
   * own `security` (including `[]` = public) wins.
   */
  security?: readonly string[];
  /** Default page layout for the class's templated routes (see `RapidModuleMeta`). */
  layout?: RapidModuleMeta['layout'];
  /**
   * Middleware for every `@GET`/… route and `@SOCKET` command in the
   * class, run before each one's own `middleware` (see `RapidModuleMeta`).
   * Not applied to `@JOB` — jobs take app-level middleware only.
   */
  middleware?: RapidModuleMeta['middleware'];
};

/**
 * The options-only form's options: identity (`name`/`namespace`) comes
 * from the module's fields; everything else — mount shape AND OpenAPI
 * grouping — may be declared here.
 */
export type ModuleMountOptions = Pick<
  ModuleDecoratorOptions,
  | 'prefix'
  | 'version'
  | 'description'
  | 'tags'
  | 'security'
  | 'layout'
  | 'middleware'
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
 * @param name - The module's identity (diagnostics, and the default
 *   OpenAPI tag of its routes) — required, unlike everything in `options`.
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
  assertMiddlewareList('@Module', opts.middleware);
  const prefixes = normalisePrefixes(name, opts.prefix);
  const meta: RapidModuleMeta = {
    ...(name !== undefined ? { name } : {}),
    prefixes,
    ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
    ...(opts.version !== undefined ? { version: opts.version } : {}),
    ...(opts.description !== undefined
      ? { description: opts.description }
      : {}),
    ...(opts.tags !== undefined ? { tags: opts.tags } : {}),
    ...(opts.security !== undefined ? { security: opts.security } : {}),
    ...(opts.layout !== undefined ? { layout: opts.layout } : {}),
    ...(opts.middleware !== undefined ? { middleware: opts.middleware } : {}),
  };
  return (target, context): void => {
    assertClassContext(context, 'Module');
    recordModule(target, meta);
  };
}
