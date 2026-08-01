/**
 * @fileoverview Logger — singleton with @Dose Config. Prefixes
 * every line with the app name + version.
 *
 * @module
 */

import { Dose, Vial } from '../../mod.ts';
import { Config } from './Config.ts';

@Vial('SINGLETON')
export class Logger {
  @Dose()
  public config!: Config;

  public info(msg: string): void {
    console.log(`[${this.config.appName} v${this.config.version}] ${msg}`);
  }
}
