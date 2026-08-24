/**
 * Entity definitions for the subscription-billing example.
 *
 * `SchemaV1` is what the app ships with; `SchemaV2` is the SAME app one
 * release later, after `invoices` grows a `Currency` column — see
 * `main.ts` scenario 9 for the Migrator run that carries a database from
 * one to the other. Both versions register the SAME entity/registry keys
 * (`Invoices`, `InvoiceAudit`, …), so `db.repo(...)` calls in `main.ts`
 * don't change shape across the upgrade, only the row shape does.
 *
 * @module
 */
import { Column, Entity, Schema } from '@tundralibs/norm';

/** norm's temporal/audit open-end marker — a version whose `EffectiveTo`
 * equals this is the CURRENT one. Matches the default in both
 * `docs/NORM-Temporal.md` and `docs/NORM-Audit.md`; only relevant here
 * because `ActiveSubscriptions` below filters on it directly. */
export const SENTINEL = '2099-12-31T23:59:59.999Z';

/** Billable plans and their per-seat price, in cents (no float rounding
 * on money). */
export const PLAN_CATALOG = {
  starter: { pricePerSeat: 900 },
  growth: { pricePerSeat: 1900 },
  scale: { pricePerSeat: 3900 },
} as const;

// ─── Customers ──────────────────────────────────────────────────────
//
// - `OrganizationId` is the tenant column `db.scope({ '@OrganizationId':
//   ... })` filters on (see main.ts scenario 5) — Customers is the only
//   entity in this schema that HAS it; Subscriptions/Invoices are
//   scoped-through via CustomerId, not directly.
// - `Email` is encrypted at rest with a digest sibling, so it stays
//   both confidential AND uniquely filterable.
// - `CardLast4` is the only payment-method fact this app stores (never
//   a full card number); `CardDisplay` is a virtual, computed-on-read
//   mask over it, for showing in a UI without re-deriving the format
//   everywhere it's read.

export const Customers = Entity('customers', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  OrganizationId: Column.uuid(),
  Name: Column.varchar(120),
  Email: Column.varchar(255)
    .beforeWrite((v) => v.trim().toLowerCase())
    .encrypt().hash()
    .comment('Ciphertext at rest; unique/filterable via Email_hash.'),
  CardLast4: Column.varchar(4).nullable(),
  CardDisplay: Column.mask('CardLast4', (v) => `•••• •••• •••• ${v}`)
    .nullable(),
  CreatedAt: Column.timestamp().default(() => new Date()),
}, {
  pk: ['Id'],
  unique: { Email: ['Email_hash'] },
});

// ─── Subscriptions (temporal) ──────────────────────────────────────
//
// One row per PLAN VERSION, not one row per customer: `Id` is a fresh
// value every version, `CustomerId` is the temporal key threading them
// together. `insert()` always supersedes — see main.ts scenario 3 for
// the upgrade + `@AsOf` read. `MonthlyAmount` gets a throwaway
// `.default(0)` purely so InsertOf doesn't demand it from callers; the
// `beforeInsert` hook (which runs BEFORE validation) overwrites it with
// the real Seats * PricePerSeat every time.

export const Subscriptions = Entity('subscriptions', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  CustomerId: Column.uuid(),
  Plan: Column.varchar(20).lov(['starter', 'growth', 'scale']),
  Seats: Column.integer().min(1),
  PricePerSeat: Column.integer().min(0),
  MonthlyAmount: Column.integer().min(0).default(0),
}, {
  pk: ['Id'],
  temporal: { key: ['CustomerId'] },
  fk: {
    Customer: {
      model: 'Customers',
      on: { CustomerId: 'Id' },
      reverseAs: 'Subscriptions',
      onDelete: 'CASCADE',
    },
  },
  hooks: {
    beforeInsert: (row) => ({
      ...row,
      MonthlyAmount: (row.Seats as number) * (row.PricePerSeat as number),
    }),
  },
});

/** Current-version subscriptions — a plain read-only VIEW over
 * `subscriptions`, filtered to the row whose `EffectiveTo` is the
 * open-end sentinel. Base for the `RevenueByPlan` QUERY below, and
 * readable directly (main.ts scenario 4). */
export const ActiveSubscriptions = Entity('active_subscriptions', {
  Id: Column.uuid(),
  CustomerId: Column.uuid(),
  Plan: Column.varchar(20),
  Seats: Column.integer(),
  MonthlyAmount: Column.integer(),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'subscriptions',
    columns: [
      'Id',
      'CustomerId',
      'Plan',
      'Seats',
      'MonthlyAmount',
      'EffectiveTo',
    ],
    projection: {
      '@Id': true,
      '@CustomerId': true,
      '@Plan': true,
      '@Seats': true,
      '@MonthlyAmount': true,
    },
    where: { '@EffectiveTo': new Date(SENTINEL) },
  },
});

/** Monthly recurring revenue grouped by plan, built on top of the VIEW
 * above — a terminal, read-only QUERY (main.ts scenario 4). */
export const RevenueByPlan = Entity('revenue_by_plan', {
  Plan: Column.varchar(20),
  ActiveSubscriptions: Column.integer(),
  TotalMonthlyRevenue: Column.integer(),
}, {
  type: 'QUERY',
  query: {
    type: 'SELECT',
    table: 'active_subscriptions',
    columns: ['Plan', 'MonthlyAmount'],
    projection: {
      '@Plan': true,
      '@ActiveSubscriptions': true,
      '@TotalMonthlyRevenue': true,
    },
    aggregates: {
      ActiveSubscriptions: { $$_aggregate: 'COUNT' },
      TotalMonthlyRevenue: { $$_aggregate: 'SUM', column: '@MonthlyAmount' },
    },
    orderBy: { '@Plan': 'ASC' },
  },
});

// ─── Invoices (audit) ───────────────────────────────────────────────
//
// The table itself stays a normal mutable ledger row — `update()` is
// ordinary in-place SQL. `audit: { name: 'InvoiceAudit' }` makes norm
// mirror every write into a generated, append-only `InvoiceAudit` repo
// (main.ts scenario 4). `InvoicesV1` is what the app ships with;
// `InvoicesV2` adds `Currency` — see the Migrator run in scenario 9.

export const InvoicesV1 = Entity('invoices', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  CustomerId: Column.uuid(),
  Plan: Column.varchar(20),
  Amount: Column.integer().min(0),
  Status: Column.varchar(10).lov(['open', 'paid', 'void']).default('open'),
  IssuedAt: Column.timestamp().default(() => new Date()),
}, {
  pk: ['Id'],
  fk: {
    Customer: {
      model: 'Customers',
      on: { CustomerId: 'Id' },
      reverseAs: 'Invoices',
      onDelete: 'CASCADE',
    },
  },
  audit: { name: 'InvoiceAudit' },
});

export const SchemaV1 = Schema('Billing', {
  Customers,
  Subscriptions,
  ActiveSubscriptions,
  RevenueByPlan,
  Invoices: InvoicesV1,
});

/** `invoices` gains `Currency` (ISO 4217). It's declared `.nullable()`
 * on purpose: norm never emits a DDL-level `DEFAULT` on `ADD COLUMN`
 * (see docs/NORM-Migrations.md "NOT NULL warnings") — a NOT NULL add
 * against the already-populated `invoices` table from scenarios 1-7
 * would be blocked. Existing rows read back `Currency: null`; new
 * inserts still get `'USD'` from the app-level `.default()`. */
export const InvoicesV2 = Entity('invoices', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  CustomerId: Column.uuid(),
  Plan: Column.varchar(20),
  Amount: Column.integer().min(0),
  Currency: Column.varchar(3).nullable().default('USD'),
  Status: Column.varchar(10).lov(['open', 'paid', 'void']).default('open'),
  IssuedAt: Column.timestamp().default(() => new Date()),
}, {
  pk: ['Id'],
  fk: {
    Customer: {
      model: 'Customers',
      on: { CustomerId: 'Id' },
      reverseAs: 'Invoices',
      onDelete: 'CASCADE',
    },
  },
  audit: { name: 'InvoiceAudit' },
});

export const SchemaV2 = Schema('Billing', {
  Customers,
  Subscriptions,
  ActiveSubscriptions,
  RevenueByPlan,
  Invoices: InvoicesV2,
});
