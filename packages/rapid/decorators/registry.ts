/**
 * @fileoverview The decoration side-table: a `WeakMap` keyed by the
 * METHOD FUNCTION itself. Chosen over `context.metadata` /
 * `Symbol.metadata` deliberately — the symbol needs a polyfill (and an
 * import-order guarantee) on Bun and Node, while a side-table works on
 * every runtime unconditionally. A TC39 method decorator never sees
 * the class constructor, so the FUNCTION is the only stable key
 * available at decoration time; the module tier resolves
 * class → entries by walking the instance's prototype at mount.
 *
 * CAVEAT (documented contract): a third-party WRAPPING decorator —
 * one that RETURNS a replacement function — installs that replacement
 * on the prototype, and the replacement carries no metadata. Because
 * TC39 applies decorators bottom-up and feeds each result to the next,
 * a rAPId decorator must sit ABOVE any wrapper (further from the
 * method), so it records the function that actually lands:
 *
 * ```typescript
 * class Ok {
 *   @GET('/x')     // ← applied LAST: records the wrapper. Works.
 *   @Measure       // ← applied first: returns the replacement
 *   handler() {}
 * }
 *
 * class Broken {
 *   @Measure       // ← applied last: its replacement is installed
 *   @GET('/x')     // ← applied first: recorded the ORIGINAL, now
 *   handler() {}   //   unreachable — the route is silently lost
 * }
 * ```
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type { RapidDecoration, RapidModuleMeta } from '../types/mod.ts';

/** The side-table. WeakMap: entries die with the class, no leaks. */
const REGISTRY = new WeakMap<object, RapidDecoration[]>();

/**
 * `@Module`'s side-table, keyed by CONSTRUCTOR (a class decorator sees
 * the class, unlike a method decorator). Separate map from
 * {@link REGISTRY} — different key population (constructors vs method
 * functions) — kept as two WeakMaps rather than one keyed union so
 * each stays a plain, ungapped lookup.
 */
const MODULES = new WeakMap<object, RapidModuleMeta>();

/**
 * Append one decoration for `method`. APPEND, never overwrite — the
 * same method may carry several decorations (multi-transport, route
 * aliases), and the same factory may legally be applied twice.
 */
export function recordDecoration(
  method: object,
  decoration: RapidDecoration,
): void {
  const entries = REGISTRY.get(method);
  if (entries === undefined) {
    REGISTRY.set(method, [decoration]);
  } else {
    entries.push(decoration);
  }
}

/**
 * Read a method's decorations (mount-time consumer). `undefined` for
 * an undecorated function — the prototype walk uses this to skip
 * plain methods.
 */
export function decorationsOf(
  method: object,
): readonly RapidDecoration[] | undefined {
  return REGISTRY.get(method);
}

/**
 * Record `@Module`'s metadata for `ctor`. SET, not append — a class
 * carries at most one `@Module`; TC39 applying it twice (an unusual
 * but legal thing to write) means "last one wins," same as any other
 * `Map.set` — there is no sensible way to merge two prefixes.
 */
export function recordModule(ctor: object, meta: RapidModuleMeta): void {
  MODULES.set(ctor, meta);
}

/**
 * Read a class's `@Module` metadata (mount-time consumer).
 * `undefined` for a class with no `@Module` — the mount tier treats
 * that as "no prefix," not an error; `@Module` is opt-in.
 */
export function moduleMetaOf(
  ctor: object,
): Readonly<RapidModuleMeta> | undefined {
  return MODULES.get(ctor);
}

/**
 * Decoration-time guard shared by every rAPId decorator: the runtime
 * tripwire for the tsconfig trap. Under LEGACY compilation
 * (`experimentalDecorators` — the suite root's default) a decorator
 * receives `(prototype, propertyName, descriptor)` instead of
 * `(method, context)`; that mode SILENTLY corrupts metadata-only
 * decorators, so it must fail loudly here. Also rejects placements
 * the mount tier cannot serve (non-methods, static, private).
 *
 * @throws {RapidError} RAPID_CONFIG when compiled in legacy decorator
 *   mode, or when applied to anything but a public instance method.
 */
export function assertMethodContext(
  context: unknown,
  decorator: string,
): asserts context is ClassMethodDecoratorContext {
  if (
    context === null || typeof context !== 'object' ||
    !('kind' in context)
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `@${decorator} was compiled in LEGACY decorator mode — this package requires TC39 standard decorators. ` +
        `Check that the consuming project's deno.json/tsconfig.json sets "experimentalDecorators": false ` +
        `(and that bun/tsx run from a directory whose tsconfig does).`,
      details: { decorator, received: typeof context },
    });
  }
  const ctx = context as ClassMethodDecoratorContext;
  if (ctx.kind !== 'method') {
    throw new RapidError('RAPID_CONFIG', {
      message: `@${decorator} only decorates METHODS — got a ${ctx.kind} ('${
        String(ctx.name)
      }')`,
      details: { decorator, kind: ctx.kind, name: String(ctx.name) },
    });
  }
  if (ctx.static === true) {
    throw new RapidError('RAPID_CONFIG', {
      message: `@${decorator} cannot decorate STATIC method '${
        String(ctx.name)
      }' — the mount tier calls instance methods`,
      details: { decorator, name: String(ctx.name) },
    });
  }
  if (ctx.private === true) {
    throw new RapidError('RAPID_CONFIG', {
      message: `@${decorator} cannot decorate PRIVATE method '${
        String(ctx.name)
      }' — the mount tier cannot reach it`,
      details: { decorator, name: String(ctx.name) },
    });
  }
}

/**
 * The class-decorator sibling of {@link assertMethodContext} — same
 * legacy-mode tripwire, for `@Module`.
 *
 * @throws {RapidError} RAPID_CONFIG when compiled in legacy decorator
 *   mode.
 */
export function assertClassContext(
  context: unknown,
  decorator: string,
): asserts context is ClassDecoratorContext {
  if (
    context === null || typeof context !== 'object' ||
    !('kind' in context)
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `@${decorator} was compiled in LEGACY decorator mode — this package requires TC39 standard decorators. ` +
        `Check that the consuming project's deno.json/tsconfig.json sets "experimentalDecorators": false ` +
        `(and that bun/tsx run from a directory whose tsconfig does).`,
      details: { decorator, received: typeof context },
    });
  }
  const ctx = context as ClassDecoratorContext;
  if (ctx.kind !== 'class') {
    throw new RapidError('RAPID_CONFIG', {
      message: `@${decorator} only decorates CLASSES — got a ${ctx.kind}`,
      details: { decorator, kind: ctx.kind },
    });
  }
}
