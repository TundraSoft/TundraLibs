/**
 * @fileoverview UserRepository — a transient repository. Its `inject()`
 * fields carry no scope of their own, so when the repository is built
 * inside `Doctor.resolve(handler, 'req-N')` they inherit `'req-N'` as
 * the ambient operation scope — the scoped Database it sees is the
 * same one the surrounding request sees.
 *
 * @module
 */

import { inject, Vial } from '../../mod.ts';

@Vial('TRANSIENT')
export class UserRepository {
  public db = inject('Database');
  public logger = inject('WebLogger');

  public getById(id: number): { id: number; name: string } | undefined {
    return this.db.findUser(id);
  }
}
