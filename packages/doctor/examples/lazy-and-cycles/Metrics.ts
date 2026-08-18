/**
 * @fileoverview Metrics — counts enqueued jobs. No dependencies of
 * its own. Deliberately NOT imported by registry.ts up front: main.ts
 * loads it later via a dynamic `import()`, demonstrating that a vial
 * can be registered any time before it is first dispensed — useful
 * for plugin-style modules loaded on demand.
 *
 * @module
 */

import { Vial } from '../../mod.ts';

@Vial('SINGLETON')
export class Metrics {
  private count = 0;

  recordEnqueue(): void {
    this.count++;
  }

  get enqueued(): number {
    return this.count;
  }
}
