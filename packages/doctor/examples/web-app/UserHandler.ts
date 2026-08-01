/**
 * @fileoverview UserHandler — request entry point. Plain class
 * (not @Inoculate-wrapped) because we want the scope to be set
 * per-request via `Doctor.resolve(UserHandler, scope)`.
 *
 * @module
 */

import { Dose } from '../../mod.ts';
import { Database } from './Database.ts';
import { Logger } from './Logger.ts';
import { UserRepository } from './UserRepository.ts';

export class UserHandler {
  @Dose()
  public logger!: Logger;
  @Dose()
  public db!: Database;
  @Dose()
  public repo!: UserRepository;

  public handle(userId: number): { id: number; name: string } | undefined {
    this.logger.log(`UserHandler.handle(${userId})`);
    this.db.connect();
    const user = this.repo.getById(userId);
    this.logger.log(`→ result: ${JSON.stringify(user)}`);
    return user;
  }
}
