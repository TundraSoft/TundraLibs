/**
 * @fileoverview Database — scoped-per-request, depends on WebConfig
 * and WebLogger. Its `inject()` fields resolve during construction,
 * so however the instance is created — dispensed directly or pulled
 * in by another vial — it is fully wired before use.
 *
 * @module
 */

import { inject, Vial } from '../../mod.ts';

type User = { id: number; name: string };

@Vial('SCOPED')
export class Database {
  public config = inject('WebConfig');
  public logger = inject('WebLogger');

  public connect(): void {
    this.logger.log(`db connect → ${this.config.dbUrl}`);
  }

  public findUser(id: number): User {
    this.logger.log(`db.findUser(${id})`);
    return { id, name: `user-${id}` };
  }
}
