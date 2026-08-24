/**
 * Order service — every Doctor idea in one runnable app:
 *
 *   tokens.ts          typed labels (`label<T>`) for values Doctor can't `new`
 *   wiring.ts          `stock` values, `prescribe` a factory vial, `checkup()`
 *   Logger.ts          @Vial SINGLETON, injects a label
 *   Connection.ts      @Vial SCOPED — one per request scope, `discharge`d after
 *   OrderRepository.ts @Vial TRANSIENT, bound to the ambient scope's Connection
 *   PaymentGateway.ts  constructor args → prescribed with a factory
 *   AuditTrail.ts      lazy getter breaking a SINGLETON cycle; `inject('Name')`
 *   OrderService.ts    the composition, plus an OPTIONAL label via `Doctor.has`
 *   OrderHandler.ts    a plain class built per request with `Doctor.resolve`
 *   verify-testing.ts  a fresh world per case via `revoke` + `prescribe`, fakes into `wire()`
 *
 * Run on any runtime:
 *
 * ```bash
 * deno run packages/doctor/examples/order-service/main.ts
 * bun run packages/doctor/examples/order-service/main.ts
 * node --import tsx packages/doctor/examples/order-service/main.ts
 * ```
 * @module
 */
import { Doctor, ScopeRequiredError } from '@tundralibs/doctor';
import { AuditTrail } from './AuditTrail.ts';
import { Connection } from './Connection.ts';
import { OrderHandler } from './OrderHandler.ts';
import { wire } from './wiring.ts';

const say = (title: string, value: unknown) =>
  console.log(`\n▶ ${title}`, JSON.stringify(value));

const singletons = wire(
  { currency: 'EUR', reviewAbove: 500, paymentApiKey: 'sk_test' },
  { reviews: true },
);
say('1. wire() + checkup(): singletons built at boot', { singletons });

// Two requests, two scopes: each gets its OWN Connection; the transient
// repository inside each is bound to that request's Connection.
const a = Doctor.resolve(OrderHandler, 'req-a');
const b = Doctor.resolve(OrderHandler, 'req-b');
say('2. per-request scope: distinct connections, shared service', {
  a: a.handle('o-1', 120),
  b: b.handle('o-2', 900), // > reviewAbove and reviews are on → flagged
  sameRepoConnection: a.repo.conn === a.conn,
  sameService: a.orders === b.orders,
});

// Discharge ends a request: the next resolve under that scope is a NEW connection.
Doctor.discharge('req-a');
const a2 = Doctor.resolve(OrderHandler, 'req-a');
say('3. discharge(req-a) → a fresh Connection for the next req-a', {
  before: a.conn.id,
  after: a2.conn.id,
});

// SCOPED without a scope, outside any operation, fails loudly.
try {
  Doctor.dispense(Connection);
} catch (error) {
  say('4. SCOPED with no scope → ScopeRequiredError', {
    thrown: error instanceof ScopeRequiredError,
  });
}

// The cycle: OrderService eagerly injects AuditTrail; AuditTrail reaches
// back through a lazy getter — resolved only now, on first access.
say('5. lazy getter across the cycle', {
  summary: Doctor.dispense(AuditTrail).summary(),
});

Doctor.dischargeAll();
