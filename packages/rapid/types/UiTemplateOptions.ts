/**
 * @fileoverview {@link RapidUiTemplateOptions} — the CODE half of the UI
 * configuration: templates and functions, supplied programmatically
 * (the `ui` key of `Application.initialize`'s options, or the factory
 * options of a config-driven app). The serializable DATA half is
 * `RapidUiConfigOptions`; YAML can never express these.
 *
 * @module
 */

import type { Html } from '../ui/html.ts';
import type { RapidContext } from './Context.ts';
import type { RapidCoreData } from './CoreData.ts';
import type { RapidErrorTemplates } from './ErrorTemplates.ts';
import type { RapidTemplate } from './Template.ts';

/** The code-valued UI options — templates and functions only. */
export type RapidUiTemplateOptions = {
  /**
   * The CORE layout — the document tier: `<head>` (meta/css/js), body
   * open, body-end scripts. Wraps EVERY page (module/route layouts nest
   * inside it) and is never overridden below the app; its per-page
   * "edits" are its data slots (`title`, `meta`). Optional: absent, the
   * module/route layout's output serves as the page (the pre-core
   * behavior, so adoption is opt-in).
   */
  core?: RapidTemplate<RapidCoreData>;
  /**
   * App-default MODULE-tier layout — the page shape (nav, header,
   * footer, a content slot) used when neither the route nor its
   * `@Module` declares one. Always nests inside {@link core} when a
   * core is configured. A route/module `layout: false` opts out to
   * "straight into the core".
   */
  layout?: RapidTemplate<{ body: Html; title?: string }>;
  /**
   * The OPT-IN identity projection: whatever this returns is merged over
   * the default view bag and handed frozen to every template. Without
   * it, NOTHING from `ctx.auth` is reachable from templates — name
   * exactly the fields that may cross.
   */
  view?: (ctx: RapidContext) => Record<string, unknown> | undefined;
  /**
   * ONE error page template — sugar for `errorTemplates: { default }`.
   * Mutually exclusive with {@link errorTemplates}. Receives the
   * disclosure payload plus `status` and `mode`; renders inside the
   * core (module tier skipped). Absent both: `DefaultErrorPage`.
   */
  errorTemplate?: RapidTemplate<Record<string, unknown>>;
  /**
   * Per-class error pages — the CLOSED registry (see
   * {@link RapidErrorTemplates}). Mutually exclusive with
   * {@link errorTemplate}.
   */
  errorTemplates?: RapidErrorTemplates;
  /**
   * An explicit asset version map (`'/style.css'` → `'a1b2c3'`) for
   * `view.asset()` — the bundler-manifest / Workers path. Entries here
   * WIN over the lazy hash derived from `server.static`; unmapped paths
   * fall through to it (and then to passthrough).
   */
  assets?: Readonly<Record<string, string>>;
};
