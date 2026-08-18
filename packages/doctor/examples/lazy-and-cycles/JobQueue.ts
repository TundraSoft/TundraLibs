/**
 * @fileoverview JobQueue — holds pending jobs. Eagerly needs
 * JobLogger (every job logs) and Metrics (every job counts), so both
 * are `inject()` field initializers, resolved while the instance
 * constructs — by the time `new JobQueue()` returns, both are wired.
 *
 * Metrics is registered via a dynamic import in main.ts (see
 * "Scenario 2" there), deliberately AFTER this module first loads:
 * dispensing JobQueue before that import runs throws
 * `UnregisteredVialError`, which is exactly what `Doctor.checkup()`
 * is for — catching a missing dependency at boot instead of on the
 * first real job.
 *
 * @module
 */

import { inject, Vial } from '../../mod.ts';

@Vial('SINGLETON')
export class JobQueue {
  private readonly jobs: string[] = [];
  private readonly logger = inject('JobLogger');
  private readonly metrics = inject('Metrics');

  enqueue(job: string): void {
    this.jobs.push(job);
    this.metrics.recordEnqueue();
    this.logger.log(`enqueued "${job}" (depth ${this.jobs.length})`);
  }

  size(): number {
    return this.jobs.length;
  }
}
