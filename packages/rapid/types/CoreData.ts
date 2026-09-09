/**
 * @fileoverview {@link RapidCoreData} — the data slots of the CORE layout.
 *
 * @module
 */

import type { Html } from '../ui/html.ts';

/**
 * What the core layout receives per page: the (module-layout-wrapped)
 * `body`, the route's resolved `title`, and the route's resolved `meta`
 * record (`description`, `og:*`, `canonical`, …) — the core's only
 * per-page "edits". `htmlDocument` renders `title`/`meta` directly.
 */
export type RapidCoreData = {
  body: Html;
  title?: string;
  meta?: Readonly<Record<string, string>>;
};
