/**
 * @fileoverview {@link RapidErrorTemplates} — the CLOSED per-class error
 * page registry.
 *
 * @module
 */

import type { RapidTemplate } from './Template.ts';

/**
 * Error pages keyed by a CLOSED grammar — an exact status (400–599), a
 * class (`'4xx'` / `'5xx'`), or `'default'`; nothing else is ever a key
 * (boot-validated). Resolution is fixed: exact → class → `default` →
 * the built-in `DefaultErrorPage`. Every entry renders inside the core
 * with the disclosure payload plus `status`/`mode` as data; dispatch
 * beyond this grammar is a typed branch inside one template (see the
 * docs' error recipes).
 */
export type RapidErrorTemplates = Readonly<
  Partial<
    Record<
      number | '4xx' | '5xx' | 'default',
      RapidTemplate<Record<string, unknown>>
    >
  >
>;
