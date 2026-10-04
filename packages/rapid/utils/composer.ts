/**
 * @fileoverview The composer — a page declared as `compose: { slot:
 * 'namespace:Module:method' }` runs those resource actions IN-PROCESS
 * under its own request: one authentication, every part judged by its
 * own `access` for this caller (`invoke()` enforces it), each part
 * rendered through ITS route's template, the results attached to the
 * reply as `content.parts`. Deferred parts render a placeholder; the
 * client runtime fetches them all in ONE follow-up request
 * (`GET <page>?parts=a,b`), which this module also answers.
 *
 * Planned once at boot ({@link planCompose}: every action resolves, no
 * part mutates, every param is satisfiable), run per request
 * ({@link runCompose}) under the app's `ui.compose` caps.
 *
 * @module
 */

import type { HTTPContext } from '../context/HTTPContext.ts';
import { RapidError } from '../errors/mod.ts';
import type { ModuleRuntime } from '../modules/ModuleRuntime.ts';
import { type Html, html, render } from '../ui/html.ts';
import { renderErrorFragment, renderFragment } from '../ui/represent.ts';
import type {
  RapidBinder,
  RapidComposeSlot,
  RapidContextResponse,
  RapidContextState,
  RapidRouteCache,
  RapidRouteEntry,
  RapidRouteTemplate,
  RapidUiComposeOptions,
} from '../types/mod.ts';
import { cached, type CacheHost } from './cache.ts';
import { extractBind } from './mountModule.ts';
import { normalizeRouteTemplate } from './routeTemplate.ts';

/** The caps with every default filled in (see `RapidUiComposeOptions`). */
export type ComposeLimits = Required<RapidUiComposeOptions>;

/** The defaults `ui.compose` leaves unset. */
export const COMPOSE_DEFAULTS: ComposeLimits = Object.freeze({
  maxParts: 5,
  concurrency: 4,
  timeout: 2,
});

/** One planned part: the resolved target and how the page feeds it. */
export type ComposePlanPart = {
  name: string;
  action: string;
  target: NonNullable<ReturnType<ModuleRuntime['actionOf']>>['target'];
  method: string;
  access: string | undefined;
  binds: readonly RapidBinder[];
  /** Target param name → page path param name, fully resolved. */
  params: Readonly<Record<string, string>>;
  template: RapidRouteTemplate | undefined;
  /** The target route's `cache`, inherited: a part and a direct visit share one entry. */
  cache: RapidRouteCache | undefined;
  /** A route serves the target too — its reply is a `{ content }` to unwrap. */
  routed: boolean;
  defer: boolean;
};

/** A page's resolved parts, in declaration order. */
export type ComposePlan = {
  readonly parts: readonly ComposePlanPart[];
  readonly byName: ReadonlyMap<string, ComposePlanPart>;
};

const ACTION = /^[^:\s]+:[^:\s]+:[^:\s]+$/;
const PATH_PARAM = /:([^:/]+):/g;

const configError = (
  label: string,
  message: string,
  details: Record<string, unknown>,
) =>
  new RapidError('RAPID_CONFIG', {
    message: `${label}: ${message}`,
    details,
  });

/**
 * Resolve a route's `compose` declaration against the mounted modules.
 *
 * @throws {RapidError} RAPID_CONFIG — compose on a non-GET route, an
 *   empty set, more parts than `maxParts`, a malformed action address, a
 *   target served by a mutating route, a target binding the payload, a
 *   param the page path cannot supply, a `params` key the target does not
 *   bind, or a deferred part with no template (nothing to deliver);
 *   RAPID_COMPOSE_UNKNOWN_ACTION — no modules mounted, or an address no
 *   mounted method answers to.
 */
export function planCompose<S extends RapidContextState>(
  route: RapidRouteEntry<S>,
  runtime: ModuleRuntime | undefined,
  limits: ComposeLimits,
): ComposePlan {
  const label = `${route.method} ${route.path}`;
  const compose = route.compose!;
  if (route.method !== 'GET') {
    throw configError(label, 'compose is for GET routes — a page is a read', {
      method: route.method,
      path: route.path,
    });
  }
  const names = Object.keys(compose);
  if (names.length === 0) {
    throw configError(label, 'compose declares no parts', { path: route.path });
  }
  if (names.length > limits.maxParts) {
    throw configError(
      label,
      `compose declares ${names.length} parts; ui.compose.maxParts is ${limits.maxParts}`,
      { path: route.path, parts: names.length, maxParts: limits.maxParts },
    );
  }
  const pageParams = new Set(
    [...route.path.matchAll(PATH_PARAM)].map((m) => m[1]!),
  );
  const parts: ComposePlanPart[] = [];
  for (const name of names) {
    const raw = compose[name]!;
    const declared = typeof raw === 'string' ? { action: raw } : raw;
    const action = declared.action;
    const where = `part '${name}'`;
    if (typeof action !== 'string' || !ACTION.test(action)) {
      throw configError(
        label,
        `${where} must name an action as 'namespace:Module:method'`,
        { part: name, action },
      );
    }
    const resolved = runtime?.actionOf(action);
    if (resolved === undefined) {
      throw new RapidError('RAPID_COMPOSE_UNKNOWN_ACTION', {
        message: runtime === undefined
          ? `${label}: ${where} names '${action}' but no modules are mounted — call app.modules() before start()`
          : `${label}: ${where} names '${action}' but no mounted module serves it`,
        details: { part: name, action },
      });
    }
    const http = (resolved.decorations ?? []).filter((d) => d.kind === 'HTTP');
    const mutating = http.find((d) => d.method !== 'GET');
    if (mutating !== undefined) {
      throw configError(
        label,
        `${where} targets '${action}', served by ${mutating.method} — a part is a read`,
        { part: name, action, method: mutating.method },
      );
    }
    const binds = http[0]?.binds ?? [];
    if (binds.some((b) => b.source === 'payload')) {
      throw configError(
        label,
        `${where} targets '${action}', which binds the request payload — a part has none`,
        { part: name, action },
      );
    }
    const bound = new Set(
      binds.filter((b) => b.source === 'param').map((b) => b.name!),
    );
    for (const key of Object.keys(declared.params ?? {})) {
      if (!bound.has(key)) {
        throw configError(
          label,
          `${where} maps param '${key}', which '${action}' does not bind`,
          { part: name, action, param: key },
        );
      }
    }
    const params: Record<string, string> = {};
    for (const target of bound) {
      const source = declared.params?.[target] ?? target;
      if (!pageParams.has(source)) {
        throw configError(
          label,
          `${where} needs param '${target}', which the page path does not carry — map it with params: { ${target}: '<page param>' }`,
          { part: name, action, param: target },
        );
      }
      params[target] = source;
    }
    const templated = http.find((d) => d.template !== undefined);
    const template = templated === undefined
      ? undefined
      : normalizeRouteTemplate(templated.template!, templated.layout, action);
    const defer = declared.defer === true;
    if (defer && template === undefined) {
      throw configError(
        label,
        `${where} is deferred but '${action}' has no template — the follow-up fetch delivers markup`,
        { part: name, action },
      );
    }
    parts.push({
      name,
      action,
      target: resolved.target,
      method: resolved.method,
      access: resolved.access,
      binds,
      params,
      template,
      cache: http[0]?.cache,
      routed: http.length > 0,
      defer,
    });
  }
  return { parts, byName: new Map(parts.map((p) => [p.name, p])) };
}

/**
 * Read a `?parts=` selection: `undefined` when the query carries none
 * (a first paint), else the validated set of part names.
 *
 * @throws {RapidError} RAPID_COMPOSE_PARTS (400) — several `parts`
 *   values, an empty name, a repeated name, or one the page does not
 *   declare. (A selection can never exceed `maxParts`: it is drawn from
 *   a declared set the boot already capped.)
 */
export function selectParts(
  plan: ComposePlan,
  query: URLSearchParams,
): ReadonlySet<string> | undefined {
  const values = query.getAll('parts');
  if (values.length === 0) return undefined;
  const refuse = (reason: string, part?: string): never => {
    throw new RapidError('RAPID_COMPOSE_PARTS', {
      details: { reason, ...(part !== undefined ? { part } : {}) },
    });
  };
  if (values.length > 1) refuse('repeated-query');
  const names = values[0]!.split(',').map((n) => n.trim());
  const selected = new Set<string>();
  for (const name of names) {
    if (name === '') refuse('empty');
    if (!plan.byName.has(name)) refuse('unknown', name);
    if (selected.has(name)) refuse('repeated', name);
    selected.add(name);
  }
  return selected;
}

/** What one part came back with, before representation. */
type Outcome = {
  status: number;
  content: unknown;
  paging?: RapidContextResponse['paging'];
  ok: boolean;
};

/** What {@link runCompose} needs from the request beyond the context. */
export type ComposeRun = {
  runtime: ModuleRuntime;
  limits: ComposeLimits;
  mode: 'DEVELOPMENT' | 'PRODUCTION';
  /** The app, for a cached part's store (see `cached`). */
  host: CacheHost;
  /** Render parts as markup (the page is HTML) or hand back data (JSON). */
  asHtml: boolean;
  /** The `?parts=` selection; absent on first paint (non-deferred parts run, deferred ones place a loader). */
  select?: ReadonlySet<string>;
};

/** A `{ content }` reply — what a routed module method returns. */
const isReply = (value: unknown): value is RapidContextResponse =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  'content' in value;

/** The page URL that fetches exactly `names` — the same path and query, `parts` set. */
function partsUrl(
  ctx: HTTPContext<RapidContextState>,
  names: readonly string[],
): string {
  const url = new URL(ctx.url);
  url.searchParams.set('parts', names.join(','));
  url.searchParams.delete('retry');
  return `${url.pathname}${url.search}`;
}

/** The outcome of a throw: the mode-collapsed envelope the API would answer. */
function failed(
  ctx: HTTPContext<RapidContextState>,
  mode: ComposeRun['mode'],
  part: ComposePlanPart,
  error: unknown,
): Outcome {
  const err = RapidError.from(error);
  ctx.app.log[err.status >= 500 ? 'error' : 'warn'](
    `compose part '${part.name}' (${part.action}) failed: ${err.message}`,
    {
      code: err.code,
      requestId: ctx.requestId,
      action: ctx.action,
      ...(err.status >= 500 ? { stack: err.stack, ...err.context.debug } : {}),
    },
  );
  const payload = err.payload(mode);
  return {
    status: err.status,
    content: typeof payload === 'object' && payload !== null
      ? { ...payload, requestId: ctx.requestId }
      : payload,
    ok: false,
  };
}

/** Run one part: bind its arguments from the page, invoke it for this caller, unwrap a routed reply. */
async function runPart(
  ctx: HTTPContext<RapidContextState>,
  part: ComposePlanPart,
  run: ComposeRun,
): Promise<Outcome> {
  if (ctx.authFailed !== undefined && part.access !== undefined) {
    return failed(
      ctx,
      run.mode,
      part,
      new RapidError('RAPID_AUTH_UNAVAILABLE', {
        details: { action: part.action },
      }),
    );
  }
  // A part's binder: `param` from the page's mapped path params, anything
  // else from the page request.
  const bind = (binder: RapidBinder): unknown | Promise<unknown> => {
    if (binder.source !== 'param') return extractBind(binder, ctx);
    const raw = ctx.args.params[part.params[binder.name!]!];
    return binder.validate ? binder.validate(raw) : raw;
  };
  const invoke = async (): Promise<Outcome> => {
    const args = await Promise.all(part.binds.map(bind));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new RapidError('RAPID_TIMEOUT', {
              message: `part '${part.name}' exceeded ${run.limits.timeout}s`,
              details: { part: part.name, action: part.action },
            }),
          ),
        run.limits.timeout * 1000,
      );
    });
    const invoked = run.runtime.invoke(
      part.target,
      part.method as never,
      args as never,
      { requestId: ctx.requestId, state: ctx.state, auth: ctx.auth },
    );
    // A part that outlives its budget keeps running (nothing cancels an
    // in-flight module method); its late result is simply never read.
    invoked.catch(() => {});
    const result = await Promise.race([invoked, expiry]).finally(() =>
      clearTimeout(timer)
    );
    if (result.status < 400 && part.routed && isReply(result.content)) {
      const reply = result.content;
      return {
        status: reply.status ?? result.status,
        content: reply.content,
        ...(reply.paging !== undefined ? { paging: reply.paging } : {}),
        ok: true,
      };
    }
    return {
      status: result.status,
      content: result.content,
      ok: result.status < 400,
    };
  };
  try {
    if (part.cache === undefined) return await invoke();
    // The target route's cache, keyed by the SAME action and params a
    // direct visit uses — one entry for both. A part never reads the
    // page context itself (its binders did, and the key covers them), so
    // no read check.
    return await cached<Outcome>(
      ctx,
      run.host,
      {
        source: part.action,
        cache: part.cache,
        params: Object.fromEntries(
          Object.entries(part.params).map((
            [target, page],
          ) => [target, ctx.args.params[page]]),
        ),
        bind,
        checkReads: false,
      },
      invoke,
      (out) =>
        out.ok
          ? {
            status: out.status,
            content: out.content,
            ...(out.paging !== undefined ? { paging: out.paging } : {}),
          }
          : undefined,
      (stored) => ({ ...(stored as Omit<Outcome, 'ok'>), ok: true }),
    );
  } catch (error) {
    return failed(ctx, run.mode, part, error);
  }
}

/** The part's wrapper: what the runtime matches a deferred result against. */
const wrap = (
  name: string,
  status: number,
  inner: Html | undefined,
  loader?: string,
): Html => {
  // The formatter would reflow an `html` literal with whitespace the
  // runtime and the tests would then have to tolerate — kept verbatim.
  // deno-fmt-ignore
  const load = loader === undefined ? undefined : html` data-action="${loader}" data-load data-compose aria-busy="true"`;
  // deno-fmt-ignore
  return html`<div data-part="${name}" data-status="${status}"${load}>${inner}</div>`;
};

/**
 * Run a page's parts for this request. On first paint (`select` absent)
 * the non-deferred parts run, up to `concurrency` at once, each within
 * `timeout`; deferred parts become placeholders carrying ONE follow-up
 * URL. With `select`, exactly those parts run. A part the caller may not
 * reach, or that failed, is its error envelope — rendered through the
 * app's error templates when `asHtml` — never its content. A part that
 * timed out (504) carries a one-shot retry loader unless this request IS
 * the retry (`?retry`).
 */
export async function runCompose(
  ctx: HTTPContext<RapidContextState>,
  plan: ComposePlan,
  run: ComposeRun,
): Promise<Record<string, RapidComposeSlot>> {
  const active = run.select === undefined
    ? plan.parts.filter((p) => !p.defer)
    : plan.parts.filter((p) => run.select!.has(p.name));
  if (run.asHtml && run.select !== undefined) {
    const untemplated = active.find((p) => p.template === undefined);
    if (untemplated !== undefined) {
      throw new RapidError('RAPID_COMPOSE_PARTS', {
        details: { reason: 'untemplated', part: untemplated.name },
      });
    }
  }
  const retrying = new URL(ctx.url).searchParams.has('retry');
  const outcomes = new Array<Outcome>(active.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < active.length) {
      const i = next++;
      outcomes[i] = await runPart(ctx, active[i]!, run);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(run.limits.concurrency, active.length) },
      worker,
    ),
  );
  const slots: Record<string, RapidComposeSlot> = {};
  active.forEach((part, i) => {
    const out = outcomes[i]!;
    if (!run.asHtml) {
      slots[part.name] = { status: out.status, content: out.content };
      return;
    }
    if (out.ok) {
      if (part.template === undefined) {
        slots[part.name] = { status: out.status, content: out.content };
        return;
      }
      slots[part.name] = {
        status: out.status,
        html: wrap(
          part.name,
          out.status,
          renderFragment(part.template, out.content, ctx, out.paging),
        ),
      };
      return;
    }
    const retry = out.status === 504 && !retrying
      ? partsUrl(ctx, [part.name]) + '&retry=1'
      : undefined;
    slots[part.name] = {
      status: out.status,
      html: wrap(
        part.name,
        out.status,
        renderErrorFragment(
          out.status,
          out.content as Record<string, unknown>,
          ctx,
          run.mode,
        ),
        retry,
      ),
    };
  });
  if (run.select === undefined) {
    const deferred = plan.parts.filter((p) => p.defer);
    const loader = deferred.length === 0
      ? undefined
      : partsUrl(ctx, deferred.map((p) => p.name));
    for (const part of deferred) {
      slots[part.name] = {
        status: 202,
        deferred: true,
        ...(run.asHtml
          ? { html: wrap(part.name, 202, undefined, loader) }
          : {}),
      };
    }
  }
  return slots;
}

/** The `?parts=` response body on the ui surface: every selected part's wrapper, in declaration order. */
export function partsFragment(
  slots: Readonly<Record<string, RapidComposeSlot>>,
): string {
  return Object.values(slots).map((s) => render(s.html!)).join('');
}
