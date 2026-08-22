/**
 * @fileoverview The decoration registry: each decorated CLASS carries its
 * own record of what rapid's decorators declared, keyed by METHOD NAME, in
 * the class's TC39 decorator-metadata object (`Class[Symbol.metadata]`,
 * reached at decoration time as `context.metadata`).
 *
 * Why name-keyed metadata rather than a side-table keyed by the method
 * FUNCTION: a third-party WRAPPING decorator (one that returns a
 * replacement function) installs that replacement on the prototype. A
 * function-keyed table would hold the ORIGINAL, now-unreachable function
 * and the route would be silently lost unless the rapid decorator sat
 * above the wrapper. Keyed by name, the mount tier binds whatever function
 * is actually installed under that name — so decorator STACKING ORDER
 * DOES NOT MATTER.
 *
 * `Symbol.metadata` is not yet a native well-known symbol on every
 * runtime. It is polyfilled below, at module load, with the REGISTERED
 * symbol `Symbol.for('Symbol.metadata')` — the same fallback the
 * TypeScript/swc decorator emit uses, so the two always agree. Because
 * every rapid decorator imports this module, and ES modules evaluate their
 * imports before the importing module's body, the polyfill is guaranteed
 * to run before any class that applies a rapid decorator is defined — no
 * user action, no import order to get right. Idempotent (`??=`), so a
 * native or earlier-polyfilled symbol is left alone. Should a transform
 * ever apply standard decorators WITHOUT supplying `context.metadata`,
 * the write side fails LOUDLY rather than silently dropping routes.
 *
 * `@Module` (a CLASS decorator, which receives the constructor itself) keeps
 * a plain WeakMap keyed by constructor — it has no stacking hazard.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type {
  RapidDecoration,
  RapidModuleInvokeMiddleware,
  RapidModuleMeta,
} from '../types/mod.ts';

// ── Symbol.metadata polyfill (load-time, idempotent) ──────────────────
const SYMBOL = Symbol as unknown as { metadata?: symbol };
SYMBOL.metadata ??= Symbol.for('Symbol.metadata');
/** The decorator-metadata well-known symbol, native or polyfilled. */
const METADATA: symbol = SYMBOL.metadata;

/**
 * rapid's slot on a class's decorator-metadata object. A REGISTERED symbol
 * so two copies of this package in one process (duplicated install) still
 * read each other's records.
 */
const RAPID_SLOT: symbol = Symbol.for('@tundralibs/rapid/decorations');

/** Everything rapid's decorators declared for ONE method of ONE class. */
type MethodRecord = {
  decorations?: RapidDecoration[];
  on?: string[];
  use?: RapidModuleInvokeMiddleware[];
};

/** A class's OWN records, by method name. Null-prototype: names are data. */
type Bucket = Record<PropertyKey, MethodRecord>;

/**
 * `@Module`'s side-table, keyed by CONSTRUCTOR (a class decorator sees
 * the class, unlike a method decorator).
 */
const MODULES = new WeakMap<object, RapidModuleMeta>();

/**
 * The rapid bucket on `context.metadata`, created OWN on first write. A
 * subclass's metadata object inherits from its superclass's (TC39), so a
 * plain read would surface the PARENT's bucket — `Object.hasOwn` keeps
 * each class's records separate (and stops a subclass's decorators from
 * mutating the parent's).
 *
 * @throws {RapidError} RAPID_CONFIG when the transform supplied no
 *   `context.metadata` — the one way records could otherwise vanish
 *   silently.
 */
function bucketFor(
  context: ClassMethodDecoratorContext,
  decorator: string,
): Bucket {
  const meta = context.metadata as Record<symbol, unknown> | undefined;
  if (meta === undefined || meta === null) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `@${decorator}: the decorator transform did not supply context.metadata, ` +
        `so this decoration cannot be recorded. rapid requires TC39 standard decorators ` +
        `WITH decorator metadata (TypeScript ≥ 5.2, or a transform with metadata support).`,
      details: { decorator, name: String(context.name) },
    });
  }
  if (!Object.hasOwn(meta, RAPID_SLOT)) {
    meta[RAPID_SLOT] = Object.create(null) as Bucket;
  }
  return meta[RAPID_SLOT] as Bucket;
}

/** The record for `context.name` in its class's own bucket, created on demand. */
function recordFor(
  context: ClassMethodDecoratorContext,
  decorator: string,
): MethodRecord {
  const bucket = bucketFor(context, decorator);
  return bucket[context.name] ??= {};
}

/**
 * The class's OWN metadata object, or `undefined`. Identity-compared
 * against the superclass's rather than `Object.hasOwn(ctor, …)` so it holds
 * for any emit (defineProperty or assignment): a decorated class always
 * gets a FRESH metadata object whose prototype is the parent's.
 */
function ownMetadata(ctor: object): Record<symbol, unknown> | undefined {
  const meta = (ctor as Record<symbol, unknown>)[METADATA];
  if (meta === undefined || meta === null) return undefined;
  const parent = Object.getPrototypeOf(ctor) as
    | Record<symbol, unknown>
    | null;
  if (parent !== null && parent[METADATA] === meta) return undefined;
  return meta as Record<symbol, unknown>;
}

/** The class's OWN rapid bucket, or `undefined` when nothing was declared on it. */
function ownBucket(ctor: object): Bucket | undefined {
  const meta = ownMetadata(ctor);
  if (meta === undefined || !Object.hasOwn(meta, RAPID_SLOT)) return undefined;
  return meta[RAPID_SLOT] as Bucket;
}

/**
 * Append one decoration for the decorated method. APPEND, never overwrite
 * — the same method may carry several decorations (multi-transport, route
 * aliases), and the same factory may legally be applied twice.
 *
 * @throws {RapidError} RAPID_CONFIG when `context.metadata` is missing.
 */
export function recordDecoration(
  context: ClassMethodDecoratorContext,
  decoration: RapidDecoration,
): void {
  const record = recordFor(context, decoration.kind);
  (record.decorations ??= []).push(decoration);
}

/**
 * The decorations a class DECLARED for one of its own methods (mount-time
 * consumer; also public introspection). `undefined` when that class
 * declared none under `name` — inherited declarations are the ancestor's,
 * read by asking the ancestor.
 */
export function decorationsOf(
  ctor: object,
  name: PropertyKey,
): readonly RapidDecoration[] | undefined {
  return ownBucket(ctor)?.[name]?.decorations;
}

/**
 * The method names a class declared ANY rapid decoration on (own records
 * only). The mount tier iterates this per prototype level.
 */
export function decoratedNamesOf(ctor: object): readonly PropertyKey[] {
  const bucket = ownBucket(ctor);
  return bucket === undefined ? [] : Reflect.ownKeys(bucket);
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

/**
 * Record `@On` events for a handler (appends; several `@On` may stack).
 *
 * @throws {RapidError} RAPID_CONFIG when `context.metadata` is missing.
 */
export function recordOn(
  context: ClassMethodDecoratorContext,
  events: readonly string[],
): void {
  const record = recordFor(context, 'On');
  (record.on ??= []).push(...events);
}

/** The events a class's handler subscribes to, or `undefined` when it has no `@On`. */
export function onEventsOf(
  ctor: object,
  name: PropertyKey,
): readonly string[] | undefined {
  return ownBucket(ctor)?.[name]?.on;
}

/**
 * Record `@Use` middleware for a method. Decorators apply bottom-up, so
 * each call PREPENDS — the top-most `@Use` in source runs first.
 *
 * @throws {RapidError} RAPID_CONFIG when `context.metadata` is missing.
 */
export function recordUse(
  context: ClassMethodDecoratorContext,
  middleware: readonly RapidModuleInvokeMiddleware[],
): void {
  const record = recordFor(context, 'Use');
  record.use = [...middleware, ...(record.use ?? [])];
}

/** A class method's `@Use` chain in execution order, or `undefined` when bare. */
export function middlewareOf(
  ctor: object,
  name: PropertyKey,
): readonly RapidModuleInvokeMiddleware[] | undefined {
  return ownBucket(ctor)?.[name]?.use;
}
