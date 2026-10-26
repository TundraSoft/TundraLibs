/**
 * @fileoverview The two reads of a route's {@link RapidRouteResponse}: the
 * schema for one surface, and the shape check at registration.
 *
 * @module
 */
import { RapidError } from '../errors/mod.ts';
import type { RapidContextSurface, RapidRouteResponse } from '../types/mod.ts';

/** The schema half of {@link RapidRouteResponse}. */
type Schema = Exclude<RapidRouteResponse, { api?: unknown; ui?: unknown }>;

/** Whether `value` is a response schema — it carries one of the three methods. */
const isSchema = (value: unknown): value is Schema =>
  typeof value === 'object' && value !== null &&
  ['parse', 'toOpenAPI', 'toJSONSchema'].some((k) =>
    typeof (value as Record<string, unknown>)[k] === 'function'
  );

/**
 * The schema `response` declares for `surface` — the one schema for every
 * surface, or the `{ api, ui }` entry. Off-HTTP (`surface` undefined) only
 * the one-schema form applies.
 */
export function responseFor(
  response: RapidRouteResponse | undefined,
  surface: RapidContextSurface | undefined,
): Schema | undefined {
  if (response === undefined || isSchema(response)) return response;
  return surface === undefined ? undefined : response[surface];
}

/**
 * Check a declared `response` is a schema or `{ api?, ui? }` naming at
 * least one schema.
 *
 * @throws {RapidError} RAPID_CONFIG otherwise — a misspelled surface key
 *   would otherwise document and check nothing, silently.
 */
export function assertRouteResponse(route: string, response: unknown): void {
  if (isSchema(response)) return;
  const entries = typeof response === 'object' && response !== null
    ? Object.entries(response).filter(([, v]) => v !== undefined)
    : [];
  const perSurface = entries.length > 0 &&
    entries.every(([k, v]) => (k === 'api' || k === 'ui') && isSchema(v));
  if (!perSurface) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `${route}: response must be a schema (parse / toOpenAPI / toJSONSchema) or { api?, ui? } of schemas`,
      details: { route },
    });
  }
}
