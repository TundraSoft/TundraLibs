/**
 * @fileoverview {@link RapidUiOptions} — the LEGACY `app.ui()` options
 * shape, kept for one deprecation cycle. New code configures the UI at
 * `Application.initialize`: the serializable DATA half
 * ({@link RapidUiConfigOptions}) under the `ui:` options/YAML key, the
 * CODE half ({@link RapidUiTemplateOptions}) programmatically.
 *
 * @module
 */

import type { RapidUiConfigOptions } from './UiConfigOptions.ts';
import type { RapidUiTemplateOptions } from './UiTemplateOptions.ts';

/**
 * Options for the deprecated `app.ui()` — both halves in one bag, as the
 * one-call form always was. A legacy `layout` keeps its exact old
 * meaning: the app-default module-tier layout (with no `core`
 * configured, its output serves as the page — byte-identical behavior).
 *
 * @deprecated Configure the UI at `Application.initialize` instead.
 */
export type RapidUiOptions = RapidUiConfigOptions & RapidUiTemplateOptions;
