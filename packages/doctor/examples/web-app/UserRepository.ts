/**
 * @fileoverview UserRepository — a transient repository that
 * cascades its Database and Logger from the surrounding scope.
 *
 * @module
 */

import { Dose, Vial } from '../../mod.ts';
import { Database } from './Database.ts';
import { Logger } from './Logger.ts';

@Vial('TRANSIENT')
export class UserRepository {
  @Dose()
  public db!: Database;
  @Dose()
  public logger!: Logger;

  public getById(id: number): { id: number; name: string } | undefined {
    return this.db.findUser(id);
  }
}
