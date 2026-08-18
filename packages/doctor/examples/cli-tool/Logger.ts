/**
 * @fileoverview CliLogger — singleton whose Config dependency is an
 * `inject()` field initializer, resolved while the instance
 * constructs. Prefixes every line with the app name + version.
 *
 * @module
 */

import { inject, Vial } from '../../mod.ts';

@Vial('SINGLETON')
export class CliLogger {
  public config = inject('CliConfig');

  public info(msg: string): void {
    console.log(`[${this.config.appName} v${this.config.version}] ${msg}`);
  }
}
