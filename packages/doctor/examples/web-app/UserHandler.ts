/**
 * @fileoverview UserHandler — request entry point. A plain,
 * unregistered class: each request builds a fresh one via
 * `Doctor.resolve(UserHandler, scope)`, whose scope becomes the
 * ambient fallback for every `inject()` below — so `db` and
 * `repo.db` land on the same per-request Database.
 *
 * @module
 */

import { inject } from '../../mod.ts';

export class UserHandler {
  public logger = inject('WebLogger');
  public db = inject('Database');
  public repo = inject('UserRepository');

  public handle(userId: number): { id: number; name: string } | undefined {
    this.logger.log(`UserHandler.handle(${userId})`);
    this.db.connect();
    const user = this.repo.getById(userId);
    this.logger.log(`→ result: ${JSON.stringify(user)}`);
    return user;
  }
}
