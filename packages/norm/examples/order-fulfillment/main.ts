/**
 * Order fulfillment — products, orders, and a many-to-many sales
 * report, over an in-memory SQLite database.
 *
 *   schema.ts   Products (stock), Orders (a status hook), OrderItems
 *               (the join table, `RESTRICT` on its Product FK),
 *               OrderLines (a VIEW — many-to-many through a view),
 *               ProductSales (a QUERY aggregating on top of it).
 *   main.ts     this file — numbered scenarios, run top to bottom.
 *
 * Run on any runtime:
 *
 * ```bash
 * deno run --allow-all packages/norm/examples/order-fulfillment/main.ts
 * bun run packages/norm/examples/order-fulfillment/main.ts
 * node --import tsx packages/norm/examples/order-fulfillment/main.ts
 * ```
 *
 * Zero external infra — SQLite runs in-process (`:memory:`).
 *
 * @module
 */
import '@tundralibs/norm/engines/sqlite';
import { Norm } from '@tundralibs/norm';
import { Migrator } from '@tundralibs/norm/migrations';
import { OrderFulfillmentSchema } from './schema.ts';
// Needs a separate install: deno add @tundralibs/compat
import { makeTempDir, removeDir } from '@tundralibs/compat/file';

const say = (title: string, value: unknown) =>
  console.log(`\n▶ ${title}\n${JSON.stringify(value, null, 2)}`);

const migDir = await makeTempDir({ prefix: 'norm-order-fulfillment-' });
const norm = new Norm({ database: { dialect: 'sqlite', path: ':memory:' } });

try {
  // ─── 1. Migrator: create the schema ────────────────────────────────
  const db = norm.use(OrderFulfillmentSchema);
  const mig = new Migrator(db, { dir: migDir });
  const snap = await mig.snapshot();
  const applied = await mig.apply();
  say('1. Migrator: schema created', {
    snapshot: { version: snap.version, written: snap.written },
    applied: applied.applied,
  });

  /**
   * Place an order atomically: check + decrement stock and insert the
   * line item for every requested product, all in one transaction. A
   * product without enough stock throws — the WHOLE order (every
   * item, every stock decrement already made this call) rolls back,
   * not just the one bad line.
   */
  const placeOrder = async (
    customerEmail: string,
    items: ReadonlyArray<{ productId: string; quantity: number }>,
  ) =>
    await db.transaction(async (tx) => {
      const order = (await tx.repo('Orders').insert({
        CustomerEmail: customerEmail,
      })).data[0]!;
      for (const item of items) {
        const product = (await tx.repo('Products').findOne({
          '@Id': item.productId,
        })).data!;
        if (product.Stock < item.quantity) {
          throw new Error(
            `insufficient stock for ${product.Name}: have ${product.Stock}, need ${item.quantity}`,
          );
        }
        await tx.repo('Products').update(
          { Stock: product.Stock - item.quantity },
          { '@Id': item.productId },
        );
        await tx.repo('OrderItems').insert({
          OrderId: order.Id,
          ProductId: item.productId,
          Quantity: item.quantity,
          UnitPriceCentsAtOrder: product.UnitPriceCents,
        });
      }
      return order;
    });

  // ─── 2. Products: seed stock ────────────────────────────────────────
  const products = (await db.repo('Products').insert([
    { Sku: 'MUG-01', Name: 'Ceramic Mug', UnitPriceCents: 1200, Stock: 5 },
    { Sku: 'TSHIRT-01', Name: 'Logo T-Shirt', UnitPriceCents: 2500, Stock: 2 },
    { Sku: 'STICKER-01', Name: 'Sticker Pack', UnitPriceCents: 500, Stock: 0 },
  ])).data;
  const [mug, tshirt, sticker] = products;
  say('2. Products seeded', {
    products: products.map((p) => ({ Sku: p.Sku, Stock: p.Stock })),
  });

  // ─── 3. A valid order: stock decrements atomically ─────────────────
  const goodOrder = await placeOrder('ada@customer.dev', [
    { productId: mug!.Id, quantity: 2 },
    { productId: tshirt!.Id, quantity: 1 },
  ]);
  const mugAfterOrder = await db.repo('Products').findOne({ '@Id': mug!.Id });
  say('3. Valid order: stock decrements atomically', {
    orderId: goodOrder.Id,
    lineItemCount: (await db.repo('OrderItems').count({
      '@OrderId': goodOrder.Id,
    })).count,
    mugStockAfter: mugAfterOrder.data!.Stock, // 5 - 2 = 3
  });

  // ─── 4. An order exceeding stock: the WHOLE transaction rolls back ─
  // Sticker has 0 in stock, but the mug line ahead of it would
  // otherwise have succeeded — proving it's all-or-nothing, not
  // first-come-first-served.
  const mugStockBefore =
    (await db.repo('Products').findOne({ '@Id': mug!.Id })).data!.Stock;
  let rejected = false;
  let rejectionMessage = '';
  try {
    await placeOrder('grace@customer.dev', [
      { productId: mug!.Id, quantity: 1 },
      { productId: sticker!.Id, quantity: 1 }, // 0 in stock
    ]);
  } catch (e) {
    rejected = true;
    rejectionMessage = e instanceof Error ? e.message : String(e);
  }
  const mugStockAfterRejection =
    (await db.repo('Products').findOne({ '@Id': mug!.Id })).data!.Stock;
  say('4. Insufficient stock rolls back the WHOLE order', {
    rejected,
    rejectionMessage,
    mugStockUnchanged: mugStockAfterRejection === mugStockBefore,
  });

  // ─── 5. beforeUpdate: a hook computed from the SAME payload ────────
  // Shipping stamps ShippedAt; cancelling stamps CancelledAt — both
  // derived from `Status` in the very call that sets it, never a
  // second round-trip.
  const orders = db.repo('Orders');
  await orders.update({ Status: 'shipped' }, { '@Id': goodOrder.Id });
  const secondOrder = await placeOrder('liam@customer.dev', [
    { productId: tshirt!.Id, quantity: 1 },
  ]);
  await orders.update({ Status: 'cancelled' }, { '@Id': secondOrder.Id });
  const shipped = await orders.findOne({ '@Id': goodOrder.Id });
  const cancelled = await orders.findOne({ '@Id': secondOrder.Id });
  say('5. beforeUpdate stamps a timestamp from the SAME payload', {
    shippedAtSet: shipped.data!.ShippedAt !== null,
    cancelledAtSet: cancelled.data!.CancelledAt !== null,
  });

  // ─── 6. RESTRICT: a product with order history can't be deleted ───
  // Sticker never sold (scenario 4's order was rejected) — it deletes
  // cleanly. Mug has real order history — the same delete() call is
  // refused by the database's own FK constraint.
  const stickerDeleted = await db.repo('Products').delete({
    '@Id': sticker!.Id,
  });
  let mugDeleteBlocked = false;
  try {
    await db.repo('Products').delete({ '@Id': mug!.Id });
  } catch {
    mugDeleteBlocked = true;
  }
  say("6. RESTRICT blocks deleting a product that's been ordered", {
    unorderedProductDeleted: stickerDeleted.count === 1,
    orderedProductDeleteBlocked: mugDeleteBlocked,
  });

  // ─── 7. Reporting: the many-to-many VIEW + a QUERY on top of it ───
  const lines = await db.repo('OrderLines').find({ '@OrderId': goodOrder.Id });
  const sales = await db.repo('ProductSales').find();
  say('7. OrderLines (many-to-many view) + ProductSales (top sellers)', {
    firstOrderLines: lines.data.map((l) => ({
      product: l.ProductName,
      qty: l.Quantity,
      lineTotalCents: l.LineTotalCents,
    })),
    topSellers: sales.data.map((s) => ({
      product: s.ProductName,
      unitsSold: s.UnitsSold,
      revenueCents: s.RevenueCents,
    })),
  });
} finally {
  await norm.disconnect();
  await removeDir(migDir, { recursive: true });
}
