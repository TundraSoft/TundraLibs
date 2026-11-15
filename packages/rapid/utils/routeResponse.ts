/**
 * @fileoverview The reads of a route's {@link RapidRouteResponse}: the
 * entry for one surface, the shape check at registration, whether a reply
 * is of the kind its route names, and which routes must declare one.
 *
 * @module
 */
import { RapidError } from '../errors/mod.ts';
import type {
  RapidContextResponse,
  RapidContextSurface,
  RapidRouteEntry,
  RapidRouteResponse,
  RapidRouteResponseKind,
} from '../types/mod.ts';
import { isStreamBody } from './streams.ts';

/** One surface's entry of a {@link RapidRouteResponse}. */
type Entry = Exclude<RapidRouteResponse, { api?: unknown; ui?: unknown }>;

/** The schema half of an {@link Entry}. */
type Schema = Exclude<Entry, RapidRouteResponseKind>;

/** The reply kinds a route can name in place of a schema. */
export const RESPONSE_KINDS: readonly RapidRouteResponseKind[] = [
  'none',
  'text',
  'bytes',
  'stream',
  'redirect',
];

/** Whether a surface's entry is a {@link RapidRouteResponseKind}. */
export const isResponseKind = (
  value: unknown,
): value is RapidRouteResponseKind =>
  RESPONSE_KINDS.includes(value as RapidRouteResponseKind);

/** Whether `value` is a response schema — it carries one of the three methods. */
const isSchema = (value: unknown): value is Schema =>
  typeof value === 'object' && value !== null &&
  ['parse', 'toOpenAPI', 'toJSONSchema'].some((k) =>
    typeof (value as Record<string, unknown>)[k] === 'function'
  );

const isEntry = (value: unknown): value is Entry =>
  isSchema(value) || isResponseKind(value);

/**
 * The entry `response` declares for `surface` — the one value for every
 * surface, or the `{ api, ui }` entry. Off-HTTP (`surface` undefined) only
 * the one-value form applies.
 */
export function responseFor(
  response: RapidRouteResponse | undefined,
  surface: RapidContextSurface | undefined,
): Entry | undefined {
  if (response === undefined || isEntry(response)) return response;
  return surface === undefined ? undefined : response[surface];
}

/**
 * Check a declared `response` is a schema, a reply kind, or `{ api?, ui? }`
 * naming at least one of those.
 *
 * @throws {RapidError} RAPID_CONFIG otherwise — a misspelled kind or
 *   surface key would otherwise document and check nothing, silently.
 */
export function assertRouteResponse(route: string, response: unknown): void {
  if (isEntry(response)) return;
  const entries = typeof response === 'object' && response !== null
    ? Object.entries(response).filter(([, v]) => v !== undefined)
    : [];
  const perSurface = entries.length > 0 &&
    entries.every(([k, v]) => (k === 'api' || k === 'ui') && isEntry(v));
  if (!perSurface) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `${route}: response must be a schema (parse / toOpenAPI / toJSONSchema), one of ${
          RESPONSE_KINDS.map((kind) => `'${kind}'`).join(', ')
        }, or { api?, ui? } of those`,
      details: { route },
    });
  }
}

/**
 * Whether a success reply is of the kind its route names. A `'redirect'`
 * route must redirect; any other route may also redirect, which is not a
 * reply of its kind and is not judged.
 */
export function replyIsKind(
  kind: RapidRouteResponseKind,
  reply: RapidContextResponse | null,
): boolean {
  if (kind === 'redirect') return reply?.redirect !== undefined;
  if (reply?.redirect !== undefined) return true;
  if (kind === 'none') {
    return reply === null || reply.status === 204 || reply.content === '';
  }
  if (reply === null) return false;
  return kind === 'text'
    ? typeof reply.content === 'string'
    : kind === 'bytes'
    ? reply.content instanceof Uint8Array
    : isStreamBody(reply.content);
}

/** Handlers rapid ships (`health()`, `openapi()`, …): their routes declare nothing. */
const BUILT_IN = new WeakSet<object>();

/** Mark a handler rapid ships, so its route needs no `response`. */
export function builtInHandler<H extends object>(handler: H): H {
  BUILT_IN.add(handler);
  return handler;
}

/**
 * The routes that answer data and declare no `response`: every route
 * except a `uiOnly` one, a page (`prefer: 'html'`) on an app with no api
 * surface, and rapid's own endpoints.
 */
export function routesWithoutResponse(
  routes: readonly RapidRouteEntry[],
  app: { uiPrefer: 'json' | 'html'; api: boolean },
): string[] {
  return routes.filter((route) =>
    route.openapi?.response === undefined && route.uiOnly !== true &&
    !BUILT_IN.has(route.handler) &&
    !(route.template !== undefined && !app.api &&
      (route.template.prefer ?? app.uiPrefer) === 'html')
  ).map((route) =>
    `${route.method} ${route.path}${
      route.version === undefined ? '' : ` @${route.version}`
    }`
  );
}
