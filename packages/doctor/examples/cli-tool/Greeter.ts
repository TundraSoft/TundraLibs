/**
 * @fileoverview Greeter — singleton business-logic service shared by
 * every command. Pulls CliConfig + CliLogger with `inject()` field
 * initializers; the cascade resolves during construction.
 *
 * @module
 */

import { inject, Vial } from '../../mod.ts';

@Vial('SINGLETON')
export class Greeter {
  public config = inject('CliConfig');
  public logger = inject('CliLogger');

  public greet(name: string, formal: boolean): string {
    const message = formal ? `Good day, ${name}.` : `Hey ${name}!`;
    this.logger.info(`greeting: ${message}`);
    return message;
  }
}
