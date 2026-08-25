/**
 * Verifies the testing idiom documented in docs/Doctor-Stock.md ("Testing:
 * revoke + stock, not reset"): between cases, REVOKE what the previous case
 * registered, re-`prescribe` the vials, and let fakes ride into `wire()`
 * before `checkup()` builds anything — no `Doctor.reset()`, which would also
 * wipe every `@Vial` registration made at import time.
 *
 * Deliberately NOT named `*.test.ts`: `deno test` / `bun test` discovery and
 * CI's `node --import tsx --test 'packages/**\/*.test.ts'` glob sweep any
 * matching file straight into the required suite — that glob can't be
 * filtered by `deno.json` config, so file naming is the only guardrail (see
 * .github/instructions/documentation.instructions.md, "Example Projects").
 * Run it by hand instead:
 *
 *   deno run packages/doctor/examples/order-service/verify-testing.ts
 *   bun run packages/doctor/examples/order-service/verify-testing.ts
 *   node --import tsx packages/doctor/examples/order-service/verify-testing.ts
 * @module
 */
import * as asserts from '@std/asserts';
import { Doctor, type VialClass, type VialModes } from '@tundralibs/doctor';
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

let cases = 0;
const check = (name: string, run: () => void) => {
  run();
  cases++;
  console.log(`✓ ${name}`);
};

check(
  'places an order under a request scope, stamped by the frozen clock',
  () => {
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
  },
);

check('flags only when the optional REVIEWER label is stocked', () => {
  boot({ reviews: false });
  const off = Doctor.resolve(OrderHandler, 'r').handle('o-2', 900);
  asserts.assert(off.status === 'placed' && off.flagged === false);
  boot({ reviews: true });
  const on = Doctor.resolve(OrderHandler, 'r').handle('o-3', 900);
  asserts.assert(on.status === 'placed' && on.flagged === true);
});

check(
  'a declining gateway, stocked under the CLASS token, is audited and never saved',
  () => {
    boot({ gateway: new PaymentGateway('') }); // '' → declines
    const h = Doctor.resolve(OrderHandler, 'req-2');
    asserts.assertEquals(h.handle('o-9', 10).status, 'declined');
    asserts.assertEquals(h.repo.count(), 0);
    asserts.assert(
      h.orders.audit.entries.some((e) => e.what.includes('o-9 declined')),
    );
  },
);

console.log(`\n${cases} checks passed`);
