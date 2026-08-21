/**
 * @fileoverview {@link RapidClusterSnapshot} — the fleet picture the
 * manager collates and broadcasts; what {@link Application.cluster}
 * returns and the dev console renders in cluster mode.
 *
 * @module
 */

import type { RapidClusterMember } from './Member.ts';

/**
 * The whole-cluster snapshot the manager builds from worker pushes and
 * broadcasts back, so any node holds the same picture. `seq`/`at` order
 * it; `leader` is the current cron-leader's instance id. The dev console
 * reads `app.cluster` and renders this when present (else the node's own
 * `app.metrics`). The manager (post-1.0 cluster module) fills the slot
 * via {@link Application.setCluster}; it is `undefined` on a solo node.
 */
export type RapidClusterSnapshot = {
  /** Monotonic sequence — a later `seq` supersedes an earlier one. */
  seq: number;
  /** When the manager assembled it, ISO-8601. */
  at: string;
  /** The current cron-leader's instance id. */
  leader: string;
  /** Every known node. */
  members: readonly RapidClusterMember[];
};
