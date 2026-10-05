/**
 * @fileoverview {@link RapidLayoutData} — the data slots of a MODULE-tier
 * layout.
 *
 * @module
 */

import type { Html } from '../ui/html.ts';

/**
 * What a module/route layout receives per page: the rendered fragment as
 * `body`, the route's resolved `title`, and the route's resolved
 * `layoutData` as `page` — whatever else the frame shows for this page (a
 * breadcrumb, a back link). The core never sees `page`, and a swap never
 * renders the layout.
 */
export type RapidLayoutData = {
  body: Html;
  title?: string;
  page?: Readonly<Record<string, unknown>>;
};
