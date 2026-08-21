/**
 * Testing a wired app without `Doctor.reset()` (which would also wipe
 * every `@Vial` registration made at import time): between cases the
 * boot helper REVOKES what the last case registered and re-prescribes
 * the vials, so singletons are rebuilt — and the fakes ride into `wire()`
 * so they are in place before `checkup()` builds anything.
 * @module
 */
import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { Doctor, type VialClass, type VialModes } from '../../mod.ts';
import { AuditTrail } from './AuditTrail.ts';
import { Connection } from './Connection.ts';
import { Logger } from './Logger.ts';
import { OrderHandler } from './OrderHandler.ts';
import { OrderRepository } from './OrderRepository.ts';
import { OrderService } from './OrderService.ts';
import { PaymentGateway } from './PaymentGateway.ts';
import { CLOCK, CONFIG, REVIEWER } from './tokens.ts';
import { wire, type WireOptions } from './wiring.ts';

const FROZEN = new Date('2026-01-01T00:00:00.000Z');
const VIALS: [VialClass, VialModes][] = [
  [Logger, 'SINGLETON'],
  [Connection, 'SCOPED'],
  [OrderRepository, 'TRANSIENT'],
  [AuditTrail, 'SINGLETON'],
  [OrderService, 'SINGLETON'],
];

/** Fresh world per case: revoke the previous case's entries, re-prescribe the vials, wire with fakes. */
const boot = (options: WireOptions = {}) => {
  Doctor.dischargeAll();
  for (const token of [CONFIG, CLOCK, REVIEWER, PaymentGateway]) {
    if (Doctor.has(token)) Doctor.revoke(token);
  }
  for (const [vial, mode] of VIALS) {
    if (Doctor.has(vial)) Doctor.revoke(vial); // drops its cached singleton too
    Doctor.prescribe(vial, mode);
  }
  return wire({ currency: 'EUR', reviewAbove: 500, paymentApiKey: 'sk_test' }, {
    clock: { now: () => FROZEN },
    ...options,
  });
};

describe('order-service', () => {
  it('places an order under a request scope, stamped by the frozen clock', () => {
    boot();
    const h = Doctor.resolve(OrderHandler, 'req-1');
    asserts.assertEquals(h.handle('o-1', 100), {
      status: 'placed',
      ref: 'ch_1',
      flagged: false,
      connection: h.conn.id,
    });
    asserts.assertEquals(h.conn.rows.get('o-1')?.at, FROZEN.toISOString());
    Doctor.discharge('req-1');
  });

  it('flags only when the optional REVIEWER label is stocked', () => {
    boot({ reviews: false });
    const off = Doctor.resolve(OrderHandler, 'r').handle('o-2', 900);
    asserts.assert(off.status === 'placed' && off.flagged === false);
    boot({ reviews: true });
    const on = Doctor.resolve(OrderHandler, 'r').handle('o-3', 900);
    asserts.assert(on.status === 'placed' && on.flagged === true);
  });

  it('a declining gateway, stocked under the CLASS token, is audited and never saved', () => {
    boot({ gateway: new PaymentGateway('') }); // '' → declines
    const h = Doctor.resolve(OrderHandler, 'req-2');
    asserts.assertEquals(h.handle('o-9', 10).status, 'declined');
    asserts.assertEquals(h.repo.count(), 0);
    asserts.assert(
      h.orders.audit.entries.some((e) => e.what.includes('o-9 declined')),
    );
  });
});
