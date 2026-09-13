# Order fulfillment — a NORM example

A small storefront backend: products, orders, and the many-to-many
join between them, over an in-memory SQLite database. Every file is
meant to be copied wholesale into a real project. Run it on any
runtime:

```bash
deno run --allow-all packages/norm/examples/order-fulfillment/main.ts
bun run packages/norm/examples/order-fulfillment/main.ts
node --import tsx packages/norm/examples/order-fulfillment/main.ts
```

| File        | Shows                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts` | `Products`, `Orders` (a `beforeUpdate` hook), `OrderItems` (the join table, `RESTRICT`), `OrderLines` (a VIEW — many-to-many through a view), `ProductSales` (a QUERY on top of it) |
| `main.ts`   | seven numbered scenarios, run top to bottom: Migrator create, seeding, an atomic stock-checked transaction, its rollback twin, `beforeUpdate`, `RESTRICT`, and the many-to-many report |

This example deliberately overlaps as little as possible with
[../subscription-billing](../subscription-billing) and
[../helpdesk](../helpdesk) — no encryption, no `temporal`/`audit`, no
password columns. What it shows instead:

- **Many-to-many through a view** — `OrderLines` flattens
  `OrderItems ⋈ Products` once, DB-side; its logical `fk` gives BOTH
  sides a reverse relation (`Orders.@Lines`, `Products.@SoldIn`) with
  no junction-table pivoting from the caller. `ProductSales` is a
  terminal `QUERY` aggregating revenue on top of that VIEW — the same
  "QUERY over a VIEW" shape subscription-billing uses for
  `RevenueByPlan`, applied to a genuinely different report.
- **A business-rule transaction, not just multi-table atomicity** —
  `placeOrder()` checks stock INSIDE the transaction and throws when
  it's insufficient; `db.transaction()` rolls back every write already
  made in that call, including line items for products that WERE in
  stock. It's all-or-nothing, not first-come-first-served.
- **A third referential action** — subscription-billing's example
  uses `CASCADE`, the helpdesk example uses `SET_NULL`; this one adds
  `RESTRICT`: a product that has ever appeared in an order cannot be
  deleted out from under its own sales history.
- **`hooks.beforeUpdate`** — unlike `beforeInsert`, it sees only the
  PARTIAL payload the caller supplied (never the existing row), so it
  can only derive fields from what's already IN that payload: setting
  `Status` to `'shipped'` stamps `ShippedAt` in the same call.

norm constructs and owns the SQLite engine itself from the `database`
config. `import '@tundralibs/norm/engines/sqlite'` registers the
dialect (the one engine held out of the root barrel; see the README's
"Choosing an entry point"). The one extra install is
`@tundralibs/compat`, for a cross-runtime temp directory the Migrator
writes its snapshot files into. The database itself is `:memory:`, so
that is the only disk write the example makes, and it is removed when
the run finishes.

Expected shape of the output (ids vary run to run; ordering does not):

```text
▶ 1. Migrator: schema created
{ "snapshot": { "version": 1, "written": true }, "applied": [1] }

▶ 2. Products seeded
{ "products": [{"Sku":"MUG-01","Stock":5}, {"Sku":"TSHIRT-01","Stock":2}, {"Sku":"STICKER-01","Stock":0}] }

▶ 3. Valid order: stock decrements atomically
{ "lineItemCount": 2, "mugStockAfter": 3 }

▶ 4. Insufficient stock rolls back the WHOLE order
{ "rejected": true, "rejectionMessage": "insufficient stock for Sticker Pack: have 0, need 1", "mugStockUnchanged": true }

▶ 5. beforeUpdate stamps a timestamp from the SAME payload
{ "shippedAtSet": true, "cancelledAtSet": true }

▶ 6. RESTRICT blocks deleting a product that's been ordered
{ "unorderedProductDeleted": true, "orderedProductDeleteBlocked": true }

▶ 7. OrderLines (many-to-many view) + ProductSales (top sellers)
{
  "firstOrderLines": [{"product":"Ceramic Mug","qty":2,"lineTotalCents":2400}, {"product":"Logo T-Shirt","qty":1,"lineTotalCents":2500}],
  "topSellers": [{"product":"Logo T-Shirt","unitsSold":2,"revenueCents":5000}, {"product":"Ceramic Mug","unitsSold":2,"revenueCents":2400}]
}
```

## What to take for your own project

| Feature demonstrated                                | Read next                                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Many-to-many through a view                          | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md#many-to-many-through-a-view)                        |
| Referential actions (`CASCADE`/`SET_NULL`/`RESTRICT`) | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md#referential-actions)                                 |
| `db.transaction()`                                    | [../../README.md](../../README.md#transactions--escape-hatches)                                            |
| `hooks.beforeUpdate` vs `hooks.beforeInsert`          | [../../docs/NORM-Schema.md](../../docs/NORM-Schema.md#hooks)                                                |
| Aggregate `QUERY` reporting                           | [../../docs/NORM-Querying.md](../../docs/NORM-Querying.md)                                                 |
