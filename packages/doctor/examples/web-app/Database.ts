/**
 * @fileoverview Database — scoped-per-request, depends on Config
 * and Logger. This is where bug #1 (no DI cascade) shows up: when
 * a parent handler resolves `Database` via @Dose, Doctor calls
 * `new Database()` but never inoculates it, so `this.config` and
 * `this.logger` stay `undefined`.
 *
 * @module
 */

import { Dose, Vial } from '../../mod.ts';
import { Config } from './Config.ts';
import { Logger } from './Logger.ts';

type User = { id: number; name: string };

@Vial('SCOPED')
export class Database {
  @Dose()
  public config!: Config;
  @Dose()
  public logger!: Logger;

  public connect(): void {
    // Would normally use this.config.dbUrl; here it would throw
    // because `this.config` is `undefined` when resolved via the
    // injector (bug #1).
    const url = this.config?.dbUrl ?? '<unknown>';
    this.logger?.log(`db connect → ${url}`);
  }

  public findUser(id: number): User {
    this.logger?.log(`db.findUser(${id})`);
    return { id, name: `user-${id}` };
  }
}
