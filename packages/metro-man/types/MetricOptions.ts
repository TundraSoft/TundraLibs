/**
 * @fileoverview Shared options accepted by every metric constructor.
 *
 * @module
 */

import type { MetricType } from './MetricType.ts';

/**
 * Common option surface for every metric.
 *
 * `name` is the metric's identifier (case-insensitive when stored in
 * a {@link MetroMan} registry). `help` is the human description that
 * surfaces in Prometheus exposition. `type` is the discriminator that
 * narrows the metric to one of {@link MetricType}.
 */
export type MetricOptions = {
  name: string;
  help?: string;
  type: MetricType;
};
