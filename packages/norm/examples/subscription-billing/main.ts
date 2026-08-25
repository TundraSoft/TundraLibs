/**
 * Subscription billing — every norm idea from the docs overhaul in one
 * runnable app:
 *
 *   schema.ts   Customers (encrypt+hash+mask, multi-tenant scoping column),
 *               Subscriptions (temporal), Invoices (audit), a VIEW + a QUERY
 *               on top of it, and the v1 → v2 schema pair for scenario 9.
 *   seed.ts     two tenant organizations and their customers, fixed UUIDs.
 *   main.ts     this file — numbered scenarios, run top to bottom.
 *
 * Run on any runtime:
 *
 * ```bash
 * deno run --allow-all packages/norm/examples/subscription-billing/main.ts
 * bun run packages/norm/examples/subscription-billing/main.ts
 * node --import tsx packages/norm/examples/subscription-billing/main.ts
 * ```
 *
 * Zero external infra — SQLite runs in-process (`:memory:`); the only
 * disk write is the Migrator's own JSON snapshots, into a throwaway temp
 * directory this file creates and removes itself.
 *
 * @module
 */
import '@tundralibs/norm/engines/sqlite';
import { Norm } from '@tundralibs/norm';
import { Migrator } from '@tundralibs/norm/migrations';
// Needs a separate install: deno add @tundralibs/compat
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import { ORG_ACME, ORG_GLOBEX, SEED_CUSTOMERS } from './seed.ts';
import { PLAN_CATALOG, SchemaV1, SchemaV2 } from './schema.ts';

// A real app reads this from the environment (`Deno.env.get` /
// `process.env`) — hardcoded so the example runs with zero setup. See
// docs/NORM-Security.md for key management.
const SECRET = 'demo-only-secret-do-not-use-in-production';

const say = (title: string, value: unknown) =>
  console.log(`\n▶ ${title}\n${JSON.stringify(value, null, 2)}`);

const migDir = await makeTempDir({ prefix: 'norm-subscription-billing-' });
const norm = new Norm({
  database: { dialect: 'sqlite', path: ':memory:' },
  secret: SECRET,
});

try {
  // ─── 1. Migrator: create the v1 schema ────────────────────────────
  // snapshot() writes migrations/0001.json from the entity definitions;
  // apply() executes the DDL it implies (CREATE TABLE for Customers,
  // Subscriptions — with its injected EffectiveFrom/EffectiveTo — and
  // Invoices PLUS its generated InvoiceAudit replica) and records it in
  // `_norm_migrations`.
  const db = norm.use(SchemaV1);
  const mig1 = new Migrator(db, { dir: migDir });
  const snap1 = await mig1.snapshot();
  const applied1 = await mig1.apply();
  say('1. Migrator v1: schema created', {
    snapshot: { version: snap1.version, written: snap1.written },
    applied: applied1.applied,
  });

  // ─── 2. Customers: encrypt+hash+mask ───────────────────────────────
  // Email is ciphertext at rest but still uniquely filterable (via the
  // Email_hash sibling); CardDisplay is computed from CardLast4 on read
  // and never stored.
  const customers = [];
  for (const c of SEED_CUSTOMERS) {
    customers.push((await db.repo('Customers').insert(c)).data[0]!);
  }
  const [acme, acmeEu, globex] = customers;
  const foundByEmail = await db.repo('Customers').findOne({
    '@Email': 'billing@acme.test', // rewritten to an Email_hash lookup
  });
  say('2. Customers inserted; filter by plaintext email', {
    inserted: customers.map((c) => ({
      Name: c.Name,
      Email: c.Email,
      CardDisplay: c.CardDisplay,
    })),
    foundByEmail: foundByEmail.data?.Name,
  });

  // ─── 3. Subscriptions: temporal supersede + @AsOf ──────────────────
  // insert() is the ONLY write verb on a temporal table — it always
  // supersedes the current version. (docs/NORM-Temporal.md shows
  // `repo.update(...)` as an equivalent way to add a version; the
  // current code actually THROWS NormUnsupportedError from update() on
  // a temporal table — a real doc/code mismatch, use insert() only.)
  const subs = db.repo('Subscriptions');
  const starter = await subs.insert({
    CustomerId: acme!.Id,
    Plan: 'starter',
    Seats: 5,
    PricePerSeat: PLAN_CATALOG.starter.pricePerSeat,
  });
  const grown = await subs.insert({
    CustomerId: acme!.Id,
    Plan: 'growth',
    Seats: 5,
    PricePerSeat: PLAN_CATALOG.growth.pricePerSeat,
  });
  // "What plan were they on before the upgrade?" — probe exactly the
  // FIRST version's own EffectiveFrom (not `new Date()`, which can race
  // the temporal supersede's monotonic cutover clock — see
  // tests/temporal-live.test.ts for the same concern). `@AsOf` rewrites
  // to `EffectiveFrom <= T AND EffectiveTo > T`, so T = EffectiveFrom is
  // inclusive and guaranteed inside THIS version's window even when the
  // next supersede lands only 1ms later.
  const asOfBeforeUpgrade = await subs.find({
    '@CustomerId': acme!.Id,
    '@AsOf': starter.data[0]!.EffectiveFrom,
  });
  const current = await subs.find({
    '@CustomerId': acme!.Id,
    '@EffectiveTo': new Date('2099-12-31T23:59:59.999Z'),
  });
  say('3. Subscriptions: supersede + @AsOf', {
    versions: (await subs.find({ '@CustomerId': acme!.Id }, {
      orderBy: { '@EffectiveFrom': 'ASC' },
    })).data.map((v) => v.Plan),
    asOfBeforeUpgrade: asOfBeforeUpgrade.data[0]!.Plan,
    current: current.data[0]!.Plan,
    upgradeVersionId: grown.data[0]!.Id,
  });

  // ─── 4. Invoices: audit replica mirrors every write ────────────────
  const invoices = db.repo('Invoices');
  const invoice = await invoices.insert({
    CustomerId: acme!.Id,
    Plan: 'growth',
    Amount: PLAN_CATALOG.growth.pricePerSeat * 5,
  });
  await invoices.update({ Status: 'paid' }, { '@Id': invoice.data[0]!.Id });
  const trail = await db.repo('InvoiceAudit').find({
    '@Id': invoice.data[0]!.Id,
  }, { orderBy: { '@EffectiveFrom': 'ASC' } });
  say('4. Invoices: insert + update, read the audit trail', {
    invoiceId: invoice.data[0]!.Id,
    liveRowStatus: (await invoices.find({ '@Id': invoice.data[0]!.Id }))
      .data[0]!.Status,
    auditVersions: trail.data.map((v) => ({
      Status: v.Status,
      current: v.EffectiveTo.getFullYear() > 2098,
    })),
  });

  // ─── 5. Reports: the VIEW and the QUERY built on it ────────────────
  const active = await db.repo('ActiveSubscriptions').find();
  const revenue = await db.repo('RevenueByPlan').find();
  say('5. ActiveSubscriptions VIEW + RevenueByPlan QUERY', {
    activeSubscriptions: active.data.map((s) => ({
      Plan: s.Plan,
      Seats: s.Seats,
    })),
    revenueByPlan: revenue.data,
  });

  // ─── 6. Multi-tenant scoping ────────────────────────────────────────
  // Customers HAS OrganizationId, so the scope filters it; Subscriptions
  // does NOT, so the same scoped handle queries it UNSCOPED — norm skips
  // a scope column an entity doesn't have rather than erroring. Scope
  // every tenant-owned entity that needs isolation, not just the top of
  // the FK chain.
  const acmeDb = db.scope({ '@OrganizationId': ORG_ACME });
  const acmeCustomers = await acmeDb.repo('Customers').find();
  const subscriptionsThroughAcmeScope = await acmeDb.repo('Subscriptions')
    .find();
  const globexDb = db.scope({ '@OrganizationId': ORG_GLOBEX });
  const globexCustomers = await globexDb.repo('Customers').find();
  say('6. db.scope(): Customers isolated, Subscriptions gracefully skipped', {
    acmeCustomerCount: acmeCustomers.count,
    globexCustomerCount: globexCustomers.count,
    subscriptionsSeenThroughAcmeScope: subscriptionsThroughAcmeScope.count,
  });

  // ─── 7. Transaction: downgrade + final invoice, atomically ─────────
  await db.transaction(async (tx) => {
    await tx.repo('Subscriptions').insert({
      CustomerId: acme!.Id,
      Plan: 'starter',
      Seats: 5,
      PricePerSeat: PLAN_CATALOG.starter.pricePerSeat,
    });
    await tx.repo('Invoices').insert({
      CustomerId: acme!.Id,
      Plan: 'growth', // final partial-month invoice at the old (higher) rate
      Amount: 2_500,
    });
  });
  const afterDowngrade = await subs.find({
    '@CustomerId': acme!.Id,
    '@EffectiveTo': new Date('2099-12-31T23:59:59.999Z'),
  });
  say('7. transaction(): downgrade + final invoice committed together', {
    currentPlan: afterDowngrade.data[0]!.Plan,
    invoiceCount: (await invoices.count({ '@CustomerId': acme!.Id })).count,
  });

  // ─── 8. Transaction rollback ────────────────────────────────────────
  // The second insert below is deliberately invalid (Status isn't one of
  // the declared `.lov([...])` values) — `as never` bypasses the
  // compile-time check that would otherwise catch this, to force the
  // RUNTIME Guardian rejection `transaction()` needs to prove atomicity.
  const beforeAttempt =
    (await invoices.count({ '@CustomerId': acmeEu!.Id })).count;
  let rolledBack = false;
  try {
    await db.transaction(async (tx) => {
      await tx.repo('Invoices').insert({
        CustomerId: acmeEu!.Id,
        Plan: 'starter',
        Amount: 900,
      });
      await tx.repo('Invoices').insert({
        CustomerId: acmeEu!.Id,
        Plan: 'starter',
        Amount: 900,
        Status: 'archived',
      } as never);
    });
  } catch {
    rolledBack = true;
  }
  const afterAttempt =
    (await invoices.count({ '@CustomerId': acmeEu!.Id })).count;
  say('8. transaction(): a bad write rolls back the WHOLE batch', {
    rolledBack,
    invoiceCountBefore: beforeAttempt,
    invoiceCountAfter: afterAttempt, // unchanged — the valid insert never committed
  });

  // ─── 9. Schema evolution: Migrator v1 → v2 ─────────────────────────
  // Same connection, a new `db` handle over SchemaV2 (Invoices gained
  // Currency). snapshot() diffs it against 0001.json and writes
  // 0002.json; apply() ALTERs `invoices` AND its InvoiceAudit replica —
  // audit tables propagate column adds automatically, no extra work.
  const db2 = norm.use(SchemaV2);
  const mig2 = new Migrator(db2, { dir: migDir });
  const snap2 = await mig2.snapshot();
  const plan2 = await mig2.plan();
  const applied2 = await mig2.apply();
  const oldInvoice = await db2.repo('Invoices').findOne({
    '@Id': invoice.data[0]!.Id,
  });
  const newInvoice = await db2.repo('Invoices').insert({
    CustomerId: globex!.Id,
    Plan: 'starter',
    Amount: PLAN_CATALOG.starter.pricePerSeat,
  });
  say('9. Migrator v1 → v2: invoices.Currency added', {
    snapshot: { version: snap2.version, written: snap2.written },
    planActionCount: plan2[0]?.queries.length ?? 0,
    planWarnings: plan2[0]?.warnings ?? [],
    applied: applied2.applied,
    preExistingInvoiceCurrency: oldInvoice.data?.Currency, // null — never backfilled
    newInvoiceCurrency: newInvoice.data[0]!.Currency, // 'USD' — the app-level default
    migrationHistory: (await mig2.history()).map((h) => h.version),
  });
} finally {
  await norm.disconnect();
  await removeDir(migDir, { recursive: true });
}
