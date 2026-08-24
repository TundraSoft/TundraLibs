/**
 * Sample data for the subscription-billing example: two tenant
 * organizations and their customers. Fixed UUIDs (rather than
 * generated ones) so `main.ts` can address a specific row without
 * threading insert results through every scenario.
 *
 * @module
 */

/** Tenant #1 — has two customers, used to show `db.scope()` narrowing
 * reads/writes to one organization. */
export const ORG_ACME = '11111111-1111-4111-8111-111111111111';
/** Tenant #2 — one customer, used as the "does this leak across
 * tenants?" control. */
export const ORG_GLOBEX = '22222222-2222-4222-8222-222222222222';

export const SEED_CUSTOMERS = [
  {
    OrganizationId: ORG_ACME,
    Name: 'Acme Rockets',
    Email: 'Billing@Acme.test',
    CardLast4: '4242',
  },
  {
    OrganizationId: ORG_ACME,
    Name: 'Acme Rockets (EU subsidiary)',
    Email: 'ap-eu@acme.test',
    CardLast4: null, // no payment method on file yet — CardDisplay reads null
  },
  {
    OrganizationId: ORG_GLOBEX,
    Name: 'Globex Corp',
    Email: 'ap@globex.test',
    CardLast4: '1881',
  },
] as const;
