/**
 * TRANSIENT: a fresh instance per resolution, each bound to the
 * Connection of the scope it was resolved under — `inject(Connection)`
 * names no scope, so it inherits the AMBIENT one from the driving
 * `Doctor.resolve(Handler, scope)` call. @module
 */
import { inject, Vial } from '../../mod.ts';
import { Connection } from './Connection.ts';

@Vial('TRANSIENT')
export class OrderRepository {
  readonly conn = inject(Connection);
  save(id: string, amount: number, at: Date): void {
    this.conn.rows.set(id, { amount, at: at.toISOString() });
  }
  count(): number {
    return this.conn.rows.size;
  }
}
