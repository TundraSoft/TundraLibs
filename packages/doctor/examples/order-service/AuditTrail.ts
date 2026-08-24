/**
 * One half of a dependency CYCLE: OrderService eagerly injects
 * AuditTrail, and AuditTrail needs OrderService — as a LAZY getter.
 * Two eager sides would throw `CircularDependencyError`; a getter
 * resolves on first access, when both instances already exist. @module
 */
import { inject, Vial } from '@tundralibs/doctor';
import type { OrderService } from './OrderService.ts';
import { CLOCK } from './tokens.ts';

@Vial('SINGLETON')
export class AuditTrail {
  readonly clock = inject(CLOCK);
  readonly entries: { at: string; what: string }[] = [];
  private __orders?: OrderService;
  /** Lazy — the cycle breaker. Resolves by NAME to avoid a value import. */
  get orders(): OrderService {
    return this.__orders ??= inject('OrderService') as OrderService;
  }
  record(what: string): void {
    this.entries.push({ at: this.clock.now().toISOString(), what });
  }
  summary(): string {
    return `${this.entries.length} audit entries, ${this.orders.placed} orders placed`;
  }
}
