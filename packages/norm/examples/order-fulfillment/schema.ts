/**
 * Entity definitions for the order-fulfillment example.
 *
 * Products (stock), Orders (a status hook stamping timestamps),
 * OrderItems (the many-to-many join between them, line total computed
 * on insert), OrderLines (a VIEW flattening that join — the
 * many-to-many-through-a-view pattern from docs/NORM-Schema.md), and
 * ProductSales (a terminal QUERY aggregating revenue on top of it).
 * See `main.ts` for the runnable scenarios.
 *
 * @module
 */
import { Column, Entity, Schema } from '@tundralibs/norm';
import { Guardian } from '@tundralibs/guardian';

// ─── Products ───────────────────────────────────────────────────────

export const Products = Entity('products', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  Sku: Column.varchar(32),
  Name: Column.varchar(120),
  UnitPriceCents: Column.integer().guard(Guardian.number().min(0)),
  Stock: Column.integer().guard(Guardian.number().min(0)).default(0),
}, {
  pk: ['Id'],
  unique: { Sku: ['Sku'] },
});

// ─── Orders ─────────────────────────────────────────────────────────
//
// `beforeUpdate` sees only the PARTIAL payload the caller supplied
// (never the existing row — that's what makes an update `Guardian`
// nullable), so it can only derive fields from what's IN that payload:
// setting `Status` to `'shipped'`/`'cancelled'` stamps the matching
// timestamp in the SAME call, without the caller repeating itself.

export const Orders = Entity('orders', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  CustomerEmail: Column.varchar(255),
  Status: Column.enum(['pending', 'paid', 'shipped', 'cancelled']).default(
    'pending',
  ),
  ShippedAt: Column.timestamp().nullable(),
  CancelledAt: Column.timestamp().nullable(),
  CreatedAt: Column.timestamp().default(() => new Date()),
}, {
  pk: ['Id'],
  hooks: {
    beforeUpdate: (row) => {
      if (row.Status === 'shipped' && row.ShippedAt === undefined) {
        return { ...row, ShippedAt: new Date() };
      }
      if (row.Status === 'cancelled' && row.CancelledAt === undefined) {
        return { ...row, CancelledAt: new Date() };
      }
      return row;
    },
  },
});

// ─── OrderItems ─────────────────────────────────────────────────────
//
// The many-to-many join table between Orders and Products.
// `LineTotalCents` is never supplied by the caller — `beforeInsert`
// derives it from `Quantity * UnitPriceCentsAtOrder` (a snapshot of
// the product's price AT ORDER TIME, immune to a later price change).
// `Product: onDelete: 'RESTRICT'` is the third referential action in
// this example set (subscription-billing uses CASCADE, the helpdesk
// example uses SET_NULL/CASCADE): a product with order history CANNOT
// be deleted out from under its own sales record.

export const OrderItems = Entity('order_items', {
  Id: Column.uuid().default({ $$_expression: 'UUID' }),
  OrderId: Column.uuid(),
  ProductId: Column.uuid(),
  Quantity: Column.integer().guard(Guardian.number().min(1)),
  UnitPriceCentsAtOrder: Column.integer().guard(Guardian.number().min(0)),
  LineTotalCents: Column.integer().default(0),
}, {
  pk: ['Id'],
  fk: {
    Order: {
      model: 'Orders',
      on: { OrderId: 'Id' },
      reverseAs: 'Items',
      onDelete: 'CASCADE',
    },
    Product: {
      model: 'Products',
      on: { ProductId: 'Id' },
      reverseAs: 'OrderItems',
      onDelete: 'RESTRICT',
    },
  },
  hooks: {
    beforeInsert: (row) => ({
      ...row,
      LineTotalCents: (row.Quantity as number) *
        (row.UnitPriceCentsAtOrder as number),
    }),
  },
});

// ─── OrderLines (many-to-many through a view) ──────────────────────
//
// Flattens OrderItems ⋈ Products once, DB-side. Its logical `fk` gives
// BOTH sides of the many-to-many a reverse relation: Orders gets
// `@Lines` (its line items, product names inline, no junction
// pivoting from the caller's side); Products gets `@SoldIn` (every
// order it has ever appeared in).

export const OrderLines = Entity('order_lines', {
  OrderId: Column.uuid(),
  ProductId: Column.uuid(),
  ProductName: Column.varchar(120),
  Quantity: Column.integer(),
  LineTotalCents: Column.integer(),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'order_items',
    columns: ['OrderId', 'ProductId', 'Quantity', 'LineTotalCents'],
    joins: {
      P: {
        table: 'products',
        columns: ['Id', 'Name'],
        type: 'INNER',
        on: { '@P.@Id': '@ProductId' },
      },
    },
    projection: {
      '@OrderId': true,
      '@ProductId': true,
      '@Quantity': true,
      '@LineTotalCents': true,
      '@P.@Name': 'ProductName',
    },
  },
  fk: {
    Order: { model: 'Orders', on: { OrderId: 'Id' }, reverseAs: 'Lines' },
    Product: {
      model: 'Products',
      on: { ProductId: 'Id' },
      reverseAs: 'SoldIn',
    },
  },
});

// ─── ProductSales (terminal report) ────────────────────────────────
//
// A grouped report over the VIEW above — same "QUERY on top of a
// VIEW" shape as subscription-billing's RevenueByPlan, applied to a
// genuinely different aggregation (units + revenue per product across
// every order it appears in, not per subscription plan).

export const ProductSales = Entity('product_sales', {
  ProductId: Column.uuid(),
  ProductName: Column.varchar(120),
  UnitsSold: Column.integer(),
  RevenueCents: Column.integer(),
}, {
  type: 'QUERY',
  query: {
    type: 'SELECT',
    table: 'order_lines',
    columns: ['ProductId', 'ProductName', 'Quantity', 'LineTotalCents'],
    projection: {
      '@ProductId': true,
      '@ProductName': true,
      '@UnitsSold': true,
      '@RevenueCents': true,
    },
    aggregates: {
      UnitsSold: { $$_aggregate: 'SUM', column: '@Quantity' },
      RevenueCents: { $$_aggregate: 'SUM', column: '@LineTotalCents' },
    },
    orderBy: { '@RevenueCents': 'DESC' },
  },
});

export const OrderFulfillmentSchema = Schema('OrderFulfillment', {
  Products,
  Orders,
  OrderItems,
  OrderLines,
  ProductSales,
});
