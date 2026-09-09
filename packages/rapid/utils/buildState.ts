/**
 * @fileoverview `buildState` — construct a per-invocation state bag from
 * the application's state template, decoupled from the app so the three
 * modes are unit-testable.
 *
 * @module
 */

import type { RapidContextState } from '../types/mod.ts';

/** How each invocation's state is derived from the template. */
export type StateMode = 'CLONE' | 'PROTOTYPE' | 'SHARE';

/**
 * Build one invocation's state from `template` per `mode`:
 *
 * - `SHARE` — every invocation reads and writes the template instance.
 * - `PROTOTYPE` — `Object.create(template)`: reads fall through, top-
 *   level writes shadow per invocation (nested writes still hit the
 *   shared template).
 * - `CLONE` (default) — a per-key deep copy; a value that cannot be
 *   `structuredClone`d (functions, class instances) is kept BY
 *   REFERENCE rather than dropped — unlike Oak's clone, nothing
 *   silently vanishes.
 */
export function buildState<S extends RapidContextState>(
  template: S,
  mode: StateMode,
): S {
  if (mode === 'SHARE') return template;
  if (mode === 'PROTOTYPE') return Object.create(template) as S;
  // Object.fromEntries DEFINES each key (like JSON.parse), never
  // ASSIGNS — a template key literally named `__proto__` lands as a
  // normal own data property instead of retargeting the clone's
  // prototype. Bracket assignment (`clone[key] = ...`) is exactly the
  // hole H1/H2 already closed in parseQueryFilters/parseBody; this is
  // app-facing state (ctx.state), so define semantics beat
  // Object.create(null) here — a null-prototype object would silently
  // break a consumer calling ctx.state.toString()/hasOwnProperty(().
  const entries = Object.entries(template).map(([key, value]) => {
    try {
      return [key, structuredClone(value)] as const;
    } catch {
      return [key, value] as const;
    }
  });
  return Object.fromEntries(entries) as S;
}
