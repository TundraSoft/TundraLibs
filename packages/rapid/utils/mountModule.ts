/**
 * @fileoverview `mountModule` — the module tier's mount engine. Turns
 * a decorated INSTANCE into route/command/job registrations on
 * whatever accepts them (structurally an {@link Application}, never
 * imported directly here — see {@link ModuleMountTarget}).
 *
 * Three problems, one resolution (full reasoning in
 * `DESIGN-modules.md`): the decoration side-table is a `WeakMap`
 * keyed by METHOD FUNCTION, so it cannot be enumerated and knows no
 * constructor — the mount tier never asks "what has been decorated?",
 * it walks the INSTANCE it was handed and asks the registry about each
 * method it finds. Explicit, per-call, nothing global — two
 * `Application`s mounting the same class never see each other's
 * routes.
 *
 * @module
 */

import type { HTTPMethod } from '@tundralibs/compat/http';
import {
  decoratedNamesOf,
  decorationsOf,
  moduleMetaOf,
} from '../decorators/mod.ts';
import { RapidModule } from '../modules/RapidModule.ts';
import { getSession } from '../middlewares/session.ts';
import type { RapidRouteOpenApi } from '../types/mod.ts';
import { RapidError } from '../errors/mod.ts';
import type {
  RapidBinder,
  RapidContext,
  RapidContextResponse,
  RapidContextState,
  RapidDecoration,
  RapidHTTPHandler,
  RapidJOBHandler,
  RapidSOCKETHandler,
} from '../types/mod.ts';

/**
 * The three registration primitives `mountModule` needs — structurally
 * satisfied by {@link Application} (never imported here, so this file
 * cannot participate in a cycle with `Application.ts`; every other
 * `utils/` helper follows the same take-only-what-you-need shape).
 */
export type ModuleMountTarget<S extends RapidContextState> = {
  route(
    method: HTTPMethod,
    path: string,
    handler: RapidHTTPHandler<S>,
  ): unknown;
  route(
    method: HTTPMethod,
    path: string,
    options: { version?: string; openapi?: RapidRouteOpenApi },
    handler: RapidHTTPHandler<S>,
  ): unknown;
  socket(command: string, handler: RapidSOCKETHandler<S>): unknown;
  job(
    name: string,
    schedule: string,
    handler: RapidJOBHandler<S>,
    options?: { args?: Readonly<Record<string, unknown>> },
  ): unknown;
};

/** A bound, callable class method — what the prototype walk collects. */
type BoundMethod = (...args: unknown[]) => unknown;

/**
 * Extract and validate ONE bind's value from `ctx`. `param`/`query`/
 * `paging` read `ctx.args` (already uniform across transports —
 * empty/default off their native transport, never an error). `payload`
 * awaits `ctx.payload` (the reserved lazy channel: HTTP's cached parse
 * promise, SOCKET's frame value, `undefined` on JOB — `await` treats
 * all three identically). `header` and `connection` differ per
 * transport; `connection` is validated transport-exclusive at MOUNT
 * time (see `assertBindableOnKind`), so it only ever reaches this
 * function on a SOCKET context.
 */
async function extractBind<S extends RapidContextState>(
  binder: RapidBinder,
  ctx: RapidContext<S>,
): Promise<unknown> {
  let raw: unknown;
  switch (binder.source) {
    case 'param':
      raw = ctx.args.params[binder.name!];
      break;
    case 'payload':
      raw = await ctx.payload;
      break;
    case 'query':
      raw = ctx.args.query;
      break;
    case 'paging':
      raw = ctx.args.paging;
      break;
    case 'header':
      raw = ctx.type === 'HTTP'
        ? ctx.headers.get(binder.name!)
        : ctx.type === 'SOCKET'
        ? ctx.connection.headers.get(binder.name!)
        : null; // JOB has no header source.
      break;
    case 'cookie':
      raw = ctx.type === 'HTTP' ? (ctx.cookies[binder.name!] ?? null) : null; // cookies are HTTP-only.
      break;
    case 'auth':
      raw = ctx.auth; // base-context bag; any transport, undefined until set.
      break;
    case 'session':
      raw = ctx.type === 'HTTP' ? getSession(ctx) : undefined; // HTTP-only.
      break;
    case 'connection':
      raw = (ctx as Extract<RapidContext<S>, { type: 'SOCKET' }>).connection;
      break;
  }
  return binder.validate ? await binder.validate(raw) : raw;
}

/**
 * The runtime half of the {@link RapidModuleReply} contract — the
 * compile-time check at the `@` site is erased at runtime, and nothing
 * downstream re-checks shape (the `response` SETTER only reads
 * `.content`, it does not validate it exists or is well-formed). This
 * is that check: a plain, non-array object with a `content` of one of
 * the three legal shapes. `status`/`headers` are left to the
 * per-transport `response` setters, which already validate what they
 * care about (3xx rejection off-HTTP, header composition) — revalidating
 * here would just drift out of sync with them.
 *
 * @throws {RapidError} RAPID_RESPONSE_INVALID when `reply` is not a
 *   `{ content }` object, or `content` is not string/plain-object/
 *   `Uint8Array`.
 */
function assertModuleReply(
  reply: unknown,
  label: string,
): RapidContextResponse {
  if (
    reply === null || typeof reply !== 'object' || Array.isArray(reply)
  ) {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message: `${label} must return a { content } response — got ${
        reply === null
          ? 'null'
          : Array.isArray(reply)
          ? 'an array'
          : typeof reply
      }`,
      details: { label },
    });
  }
  if (!('content' in reply)) {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message: `${label} response is missing "content"`,
      details: { label },
    });
  }
  const content = (reply as RapidContextResponse).content;
  const validContent = typeof content === 'string' ||
    content instanceof Uint8Array ||
    (typeof content === 'object' && content !== null &&
      !Array.isArray(content));
  if (!validContent) {
    throw new RapidError('RAPID_RESPONSE_INVALID', {
      message:
        `${label} response "content" must be a string, plain object, or Uint8Array`,
      details: { label },
    });
  }
  return reply as RapidContextResponse;
}

/**
 * Reject a bind source that cannot exist on `kind` — today only
 * `connection` (SOCKET-only by nature: `ctx.connection` is not a
 * member of `HTTPContext`/`JOBContext`). Checked ONCE per decoration
 * at mount time rather than per-invocation: a transport/bind mismatch
 * is a configuration mistake, not a runtime condition, so it fails at
 * the loudest possible moment instead of on first request.
 *
 * @throws {RapidError} RAPID_CONFIG when `binds` contains `connection`
 *   and `kind` is not `'SOCKET'`.
 */
function assertBindableOnKind(
  decoration: RapidDecoration,
  label: string,
): void {
  const badBind = decoration.binds.find((b) =>
    b.source === 'connection' && decoration.kind !== 'SOCKET'
  );
  if (badBind !== undefined) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `${label}: connection() only binds on @SOCKET methods, not @${decoration.kind}`,
      details: { label, kind: decoration.kind },
    });
  }
}

/** Build the per-transport closure `route`/`socket`/`job` receives. */
function buildInvoker<S extends RapidContextState>(
  fn: BoundMethod,
  binds: readonly RapidBinder[],
  instance: object,
  label: string,
): (ctx: RapidContext<S>) => Promise<RapidContextResponse> {
  return async (ctx: RapidContext<S>): Promise<RapidContextResponse> => {
    const args = await Promise.all(
      binds.map((binder) => extractBind<S>(binder, ctx)),
    );
    const reply = await fn.apply(instance, args);
    return assertModuleReply(reply, label);
  };
}

/** Register one decoration's closure onto `target`, dispatched by kind. */
function registerDecoration<S extends RapidContextState>(
  target: ModuleMountTarget<S>,
  decoration: RapidDecoration,
  fn: BoundMethod,
  instance: object,
  prefix: string,
  namespace: string | undefined,
  moduleVersion: string | undefined,
  label: string,
): void {
  assertBindableOnKind(decoration, label);
  switch (decoration.kind) {
    case 'HTTP': {
      // Per-route version wins; falls back to the owning @Module's
      // default; either may be absent (an unversioned route).
      const version = decoration.version ?? moduleVersion;
      const invoker = buildInvoker<S>(fn, decoration.binds, instance, label);
      const openapi: RapidRouteOpenApi = {
        binds: decoration.binds,
        ...(decoration.description !== undefined
          ? { description: decoration.description }
          : {}),
        ...(decoration.response !== undefined
          ? { response: decoration.response }
          : {}),
      };
      target.route(decoration.method, prefix + decoration.path, {
        ...(version !== undefined ? { version } : {}),
        openapi,
      }, invoker);
      break;
    }
    case 'SOCKET':
      target.socket(
        namespace !== undefined
          ? `${namespace}.${decoration.command}`
          : decoration.command,
        buildInvoker<S>(fn, decoration.binds, instance, label),
      );
      break;
    case 'JOB':
      target.job(
        namespace !== undefined
          ? `${namespace}.${decoration.name}`
          : decoration.name,
        decoration.schedule,
        buildInvoker<S>(fn, decoration.binds, instance, label),
        { args: decoration.args },
      );
      break;
  }
}

/**
 * Mount one decorated instance onto `target`: prototype-walk it, read
 * `DECORATIONS` per method, register onto `target.route`/`.socket`/
 * `.job` — the SAME core every plain `app.get()`/`app.socket()`/
 * `app.job()` call uses, so duplicate-command/duplicate-job/malformed-
 * path detection all come for free.
 *
 * SUBCLASS-OVERRIDE POLICY (decided here, not left ambiguous): the
 * registry is keyed by the exact function a decorator recorded. If a
 * subclass overrides a decorated method WITHOUT re-applying the
 * decorator, the override — the function `instance[name]` actually
 * resolves to — carries no entry, while an ancestor prototype still
 * does. Silently keeping the ancestor's registration would bind routes
 * to a method the instance no longer runs (the override becomes
 * unreachable through them, a "silently lost" bug in the same family
 * the wrapping-decorator caveat in `registry.ts` already documents as
 * the outcome to avoid). So this REJECTS LOUDLY instead: walking the
 * prototype chain top-down (most-derived first) and comparing each
 * decorated ancestor function against `instance[name]`'s actual
 * resolution catches the mismatch — and, symmetrically, a subclass
 * that DOES re-decorate its override resolves identically and mounts
 * normally, with the ancestor's now-shadowed entry skipped via `seen`.
 *
 * @throws {RapidError} RAPID_CONFIG when a decorated method is
 *   overridden without re-decorating, when a decoration binds
 *   `connection()` off SOCKET, or when `instance` has no decorated
 *   methods anywhere in its prototype chain.
 */
export function mountModule<S extends RapidContextState>(
  target: ModuleMountTarget<S>,
  instance: object,
): void {
  const ctor = (instance as { constructor: object }).constructor;
  const meta = moduleMetaOf(ctor);
  const ctorName = (ctor as { name?: string }).name ?? '(anonymous)';
  // A RapidModule's identity lives on its fields; @Module may only add
  // prefix/version. Declaring name/namespace in both places is an error,
  // not an override — one source of truth.
  const isModule = instance instanceof RapidModule;
  if (
    isModule && meta !== undefined &&
    (meta.name !== undefined || meta.namespace !== undefined)
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message: `${ctorName} is a RapidModule — its name/namespace come ` +
        `from the class fields; @Module on it takes only { prefix, version }`,
      details: { class: ctorName, meta },
    });
  }
  const prefix = meta?.prefix ?? '';
  const namespace = isModule
    ? (instance as RapidModule).namespace
    : meta?.namespace;
  const moduleVersion = meta?.version;

  const seen = new Set<PropertyKey>();
  let mounted = 0;
  let proto: object | null = Object.getPrototypeOf(instance);
  while (proto !== null && proto !== Object.prototype) {
    // The class that owns this prototype level — its OWN records are the
    // decorations declared at this level (name-keyed; see registry.ts).
    const level = Object.getOwnPropertyDescriptor(proto, 'constructor')
      ?.value as object | undefined;
    const names = level === undefined ? [] : decoratedNamesOf(level);
    for (const name of names) {
      if (seen.has(name)) continue;
      const decorations = decorationsOf(level!, name);
      if (decorations === undefined) continue; // @On/@Use only — not a mount
      seen.add(name);

      // The function INSTALLED under this name at this level — a wrapping
      // decorator's replacement, if one was stacked — via the descriptor,
      // not `proto[name]` (an accessor's getter would run with `this = proto`).
      const fn = Object.getOwnPropertyDescriptor(proto, name)?.value;
      const resolved = (instance as Record<PropertyKey, unknown>)[name];
      if (resolved !== fn) {
        const declaredOn = (level as { name?: string } | undefined)?.name ??
          '(anonymous)';
        throw new RapidError('RAPID_CONFIG', {
          message:
            `${ctorName}.${String(name)} overrides a method decorated on ` +
            `${declaredOn} without re-declaring its decorators — the ` +
            `base class's routes/commands/jobs are unreachable through ` +
            `this override. Either remove the override or re-apply the ` +
            `same decorator(s) on ${ctorName}.prototype.${String(name)}.`,
          details: { class: ctorName, method: String(name), declaredOn },
        });
      }

      const label = `${ctorName}.${String(name)}`;
      for (const decoration of decorations) {
        registerDecoration(
          target,
          decoration,
          resolved as BoundMethod,
          instance,
          prefix,
          namespace,
          moduleVersion,
          label,
        );
        mounted++;
      }
    }
    proto = Object.getPrototypeOf(proto);
  }

  if (mounted === 0) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `app.module(new ${ctorName}(...)) found no @GET/@POST/@PUT/@PATCH/` +
        `@DELETE/@SOCKET/@JOB decorated methods anywhere on its prototype ` +
        `chain — nothing to mount`,
      details: { class: ctorName },
    });
  }
}

/**
 * Does this instance carry any route/socket/job decoration on its
 * prototype chain? `app.modules()` mounts only the instances that do —
 * an event-only or invoke-only module has nothing for a transport.
 */
export function hasDecorations(instance: object): boolean {
  let proto: object | null = Object.getPrototypeOf(instance);
  while (proto !== null && proto !== Object.prototype) {
    const level = Object.getOwnPropertyDescriptor(proto, 'constructor')
      ?.value as object | undefined;
    if (level !== undefined) {
      for (const name of decoratedNamesOf(level)) {
        if (decorationsOf(level, name) !== undefined) return true;
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}
