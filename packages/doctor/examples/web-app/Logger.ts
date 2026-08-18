/**
 * @fileoverview WebLogger — a singleton that pulls WebConfig via an
 * `inject()` field initializer. Doctor lazily constructs the
 * singleton on first resolution; the field wires itself while the
 * constructor runs, so `this.config` is set by the time anyone calls
 * `log`.
 *
 * @module
 */

import { inject, Vial } from '../../mod.ts';

@Vial('SINGLETON')
export class WebLogger {
  public config = inject('WebConfig');

  public log(msg: string): void {
    console.log(`[${this.config.appName}] ${msg}`);
  }
}
