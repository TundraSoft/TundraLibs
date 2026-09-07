/**
 * @fileoverview Route-template normalisation — registration-time, so the
 * core never imports the representer just to validate a route option.
 *
 * @module
 */

import { RapidError } from '../errors/mod.ts';
import type {
  RapidRouteOptions,
  RapidRouteTemplate,
  RapidTemplate,
} from '../types/mod.ts';

/** Structurally a `RapidTemplate` — `{ name: string, render: fn }`. */
export const isTemplate = (value: unknown): value is RapidTemplate<unknown> =>
  typeof value === 'object' && value !== null &&
  typeof (value as { render?: unknown }).render === 'function' &&
  typeof (value as { name?: unknown }).name === 'string';

/**
 * Normalize a route's `template`/`layout` options into the stored
 * {@link RapidRouteTemplate} — mount/registration time, fail-fast: a
 * wrong import or a typo'd shape throws NOW, never at first request.
 *
 * @throws {RapidError} RAPID_CONFIG on a non-template `template`/
 *   `layout`, or a `prefer` outside `'json' | 'html'`.
 */
export function normalizeRouteTemplate(
  template: NonNullable<RapidRouteOptions['template']>,
  layout: RapidRouteOptions['layout'],
  label: string,
): RapidRouteTemplate {
  const bare = isTemplate(template);
  const given = bare ? undefined : template as RapidRouteTemplate;
  const config: RapidRouteTemplate = {
    render: bare ? template as RapidTemplate<unknown> : given!.render,
    // `false` survives ?? — a route's explicit tier-2 opt-out must not
    // be resurrected by the module/app default.
    ...(given?.layout ?? layout) !== undefined
      ? { layout: given?.layout ?? layout }
      : {},
    ...(given?.title !== undefined ? { title: given.title } : {}),
    ...(given?.meta !== undefined ? { meta: given.meta } : {}),
    ...(given?.prefer !== undefined ? { prefer: given.prefer } : {}),
  };
  if (
    config.title !== undefined && typeof config.title !== 'string' &&
    typeof config.title !== 'function'
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message: `route '${label}': title must be a string or (data) => string`,
    });
  }
  if (!isTemplate(config.render)) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `route '${label}': template is not a RapidTemplate (declare it via template() from @tundralibs/rapid/ui)`,
    });
  }
  if (
    config.layout !== undefined && config.layout !== false &&
    !isTemplate(config.layout)
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `route '${label}': layout is not a RapidTemplate (or false to opt out)`,
    });
  }
  if (
    config.meta !== undefined && typeof config.meta !== 'function' &&
    (typeof config.meta !== 'object' || config.meta === null)
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message: `route '${label}': meta must be a record or (data) => record`,
    });
  }
  if (
    config.prefer !== undefined && config.prefer !== 'json' &&
    config.prefer !== 'html'
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        `route '${label}': prefer must be 'json' or 'html' (got ${config.prefer})`,
    });
  }
  // FROZEN: this object is shared by every request via ctx.routeTemplate
  // — a handler mutating it must throw, not retarget the route.
  return Object.freeze(config);
}
