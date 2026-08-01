/**
 * @fileoverview `stats` — prints the current Config. Demonstrates
 * @Dose'ing two distinct services on the same handler.
 *
 * @module
 */

import { Dose, Inoculate } from '../../../mod.ts';
import { Config } from '../Config.ts';
import { Logger } from '../Logger.ts';

@Inoculate()
export class StatsCommand {
  @Dose()
  public config!: Config;
  @Dose()
  public logger!: Logger;

  public run(): void {
    this.logger.info('stats command invoked');
    console.log(`app    : ${this.config.appName}`);
    console.log(`version: ${this.config.version}`);
  }
}
