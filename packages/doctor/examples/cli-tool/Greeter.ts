/**
 * @fileoverview Greeter — singleton business-logic service shared by
 * every command. Cascades Config + Logger from the Doctor.
 *
 * @module
 */

import { Dose, Vial } from '../../mod.ts';
import { Config } from './Config.ts';
import { Logger } from './Logger.ts';

@Vial('SINGLETON')
export class Greeter {
  @Dose()
  public config!: Config;
  @Dose()
  public logger!: Logger;

  public greet(name: string, formal: boolean): string {
    const message = formal ? `Good day, ${name}.` : `Hey ${name}!`;
    this.logger.info(`greeting: ${message}`);
    return message;
  }
}
