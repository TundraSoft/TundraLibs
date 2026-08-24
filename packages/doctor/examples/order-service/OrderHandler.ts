/**
 * A PLAIN class — not a vial — built per request with
 * `Doctor.resolve(OrderHandler, scope)`: every `inject()` in it (and in
 * the transient repository it pulls) resolves under that scope, so the
 * handler, its repository and the Connection all share one request.
 * @module
 */
import { inject } from '@tundralibs/doctor';
import { Connection } from './Connection.ts';
import { OrderRepository } from './OrderRepository.ts';
import { OrderService, type PlaceResult } from './OrderService.ts';

export class OrderHandler {
  readonly conn = inject(Connection); // SCOPED — ambient scope
  readonly repo = inject(OrderRepository); // TRANSIENT — its Connection is the same one
  readonly orders = inject(OrderService); // SINGLETON — shared by every request

  handle(id: string, amount: number): PlaceResult & { connection: number } {
    return {
      ...this.orders.place(this.repo, id, amount),
      connection: this.conn.id,
    };
  }
}
