/**
 * @fileoverview Logger — a singleton that pulls Config via @Dose.
 * Now correct: Doctor lazily constructs the singleton on first
 * resolution and inoculates it before caching, so `this.config` is
 * filled in by the time anyone calls `log`.
 *
 * @module
 */

import { Dose, Vial } from '../../mod.ts';
import { Config } from './Config.ts';

@Vial('SINGLETON')
export class Logger {
  @Dose()
  public config!: Config;

  public log(msg: string): void {
    console.log(`[${this.config.appName}] ${msg}`);
  }
}
