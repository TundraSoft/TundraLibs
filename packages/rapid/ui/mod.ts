/**
 * @fileoverview `@tundralibs/rapid/ui` — the opt-in UI layer: escaping
 * render primitives and the template factory routes reference via
 * `{ template }`. The root barrel re-exports NOTHING from here — an
 * API-only app pays nothing at runtime. See docs/Rapid-UI.md (the
 * consumer contract; design record in DESIGN-ui.md).
 *
 * @module
 */

export { fingerprintAssets } from './assets.ts';
export { DefaultErrorPage } from './errorPage.ts';
export { each, when } from './flow.ts';
export { formState } from './formState.ts';
export { Html, html, htmlDocument, raw, render, template } from './html.ts';
export { UI_HISTORY, UI_HISTORY_ETAG } from './history.ts';
export { UI_LIVE, UI_LIVE_ETAG } from './live.ts';
export { UI_RUNTIME, UI_RUNTIME_ETAG } from './ui.ts';
export { withQuery } from './withQuery.ts';
export type {
  RapidCoreData,
  RapidErrorTemplates,
  RapidFormError,
  RapidFormResult,
  RapidRouteTemplate,
  RapidTemplate,
  RapidUiConfigOptions,
  RapidUiOptions,
  RapidUiTemplateOptions,
  RapidView,
} from '../types/mod.ts';
