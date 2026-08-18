/**
 * @fileoverview `stats` — prints the current CliConfig. Demonstrates
 * injecting two distinct services on the same handler, again with
 * plain `inject()` field initializers on an undecorated class.
 *
 * @module
 */

import { inject } from '../../../mod.ts';

export class StatsCommand {
  public config = inject('CliConfig');
  public logger = inject('CliLogger');

  public run(): void {
    this.logger.info('stats command invoked');
    console.log(`app    : ${this.config.appName}`);
    console.log(`version: ${this.config.version}`);
  }
}
