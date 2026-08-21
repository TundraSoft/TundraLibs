/**
 * @fileoverview {@link RapidClusterMember} — one instance's slice of a
 * {@link RapidClusterSnapshot}: its identity, role, and last-known
 * metrics as the manager collated them.
 *
 * @module
 */

import type { ServerMetrics } from '@tundralibs/compat/webserver';
import type { RapidApplicationJobMetrics } from '../application/JobMetrics.ts';

/**
 * A single node in the cluster snapshot. `role` is the cron role — one
 * `'leader'` runs the scheduled jobs, the rest are `'follower'`. `metrics`
 * / `jobs` are the node's own numbers as last pushed to the manager;
 * absent until the node has reported.
 */
export type RapidClusterMember = {
  /** The node's stable instance id ({@link Application.instanceId}). */
  id: string;
  /** Host/pod the node runs on. */
  host: string;
  /** When the node started, ISO-8601. */
  startedAt: string;
  /** Cron role — one leader runs the jobs. */
  role: 'leader' | 'follower';
  /** When the manager last heard from the node, ISO-8601. */
  lastSeen: string;
  /** The node's HTTP metrics as last reported. */
  metrics?: ServerMetrics;
  /** The node's job metrics as last reported. */
  jobs?: RapidApplicationJobMetrics;
};
