/**
 * @fileoverview JobLogger — logs queue events. Eagerly needed by
 * JobQueue (every job logs), so JobLogger cannot ALSO eagerly depend
 * back on JobQueue — that would be an unbreakable construction-time
 * cycle. Its reference back to JobQueue (used only for the rare
 * "queue is backed up" warning) is a lazy getter instead, which
 * defers resolution until first access — by then both singletons
 * already exist. Note there is no import of JobQueue.ts here at all:
 * `inject`'s return type comes from the VialRegistry augmentation in
 * registry.ts, not from importing the class — the token-based design
 * sidesteps a circular FILE import along with the circular DI one.
 *
 * @module
 */

import { inject, Vial } from '../../mod.ts';

@Vial('SINGLETON')
export class JobLogger {
  private __queue?: ReturnType<typeof inject<'JobQueue'>>;
  private get queue() {
    return this.__queue ??= inject('JobQueue');
  }

  log(msg: string): void {
    console.log(`[log] ${msg}`);
  }

  warnIfBackedUp(threshold: number): void {
    const depth = this.queue.size();
    if (depth > threshold) {
      console.log(`[log] WARNING: queue depth ${depth} exceeds ${threshold}`);
    } else {
      console.log(`[log] queue depth ${depth} within threshold ${threshold}`);
    }
  }
}
