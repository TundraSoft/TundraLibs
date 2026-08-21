/**
 * The domain service: a SINGLETON composing a label (clock), a
 * factory-built vial (gateway), another singleton (audit — the eager
 * side of the cycle) and an OPTIONAL feature discovered with
 * `Doctor.has`. It never holds a SCOPED dependency — that would be a
 * captive dependency — so the per-request repository is passed in.
 * @module
 */
import { Doctor, inject, Vial } from '../../mod.ts';
import { AuditTrail } from './AuditTrail.ts';
import type { OrderRepository } from './OrderRepository.ts';
import { PaymentGateway } from './PaymentGateway.ts';
import { CLOCK, CONFIG, REVIEWER } from './tokens.ts';

export type PlaceResult =
  | { status: 'placed'; ref: string; flagged: boolean }
  | { status: 'declined' };

@Vial('SINGLETON')
export class OrderService {
  readonly config = inject(CONFIG);
  readonly clock = inject(CLOCK);
  readonly gateway = inject(PaymentGateway);
  readonly audit = inject(AuditTrail); // eager side of the cycle
  placed = 0;

  place(repo: OrderRepository, id: string, amount: number): PlaceResult {
    const charge = this.gateway.charge(id, amount);
    if (!charge.ok) {
      this.audit.record(`order ${id} declined`);
      return { status: 'declined' };
    }
    repo.save(id, amount, this.clock.now());
    this.placed++;
    // Optional collaborator: stocked only when reviews are enabled.
    const flagged = amount > this.config.reviewAbove && Doctor.has(REVIEWER);
    if (flagged) inject(REVIEWER).flag(id, amount);
    this.audit.record(
      `order ${id} placed for ${amount} ${this.config.currency}`,
    );
    return { status: 'placed', ref: charge.ref, flagged };
  }
}
