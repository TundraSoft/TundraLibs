/**
 * RBAC-style authorization with the pure bitmask kernel.
 *
 * Only `@tundralibs/pact/authz` — no Pact engine, no crypto, no hooks. A
 * permission registry (name → BigInt bit) plus a module catalog, then:
 * evaluate grants, edit masks, compose roles into effective grants, ship
 * them over the wire as decimal strings, and turn catalog typos into loud
 * config errors instead of silent denials.
 *
 * Run:
 *   deno run packages/pact/examples/rbac-authz/main.ts
 *   bun run  packages/pact/examples/rbac-authz/main.ts
 *   node --import tsx packages/pact/examples/rbac-authz/main.ts
 */

import {
  combineGrants,
  deserializeGrants,
  Permissions,
  serializeGrants,
} from '@tundralibs/pact/authz';
import { PactDefinitionError, PactDeniedError } from '@tundralibs/pact/errors';

// ── the permission registry + module catalog ─────────────────────────
// Each permission is a unique, positive power-of-two BigInt; the catalog
// declares which permissions are *applicable* to each module. DELETE and
// PUBLISH are meaningful on a Post but not on Billing, so Billing lists
// only READ — an off-catalog check becomes a config error (see the end).
const perms = new Permissions(
  { READ: 1n, EDIT: 2n, DELETE: 4n, PUBLISH: 8n },
  { Post: ['READ', 'EDIT', 'DELETE', 'PUBLISH'], Billing: ['READ'] },
);

// ── compose effective grants from roles (allow-only OR-merge) ─────────
// A "role" is just a grants map (module → mask); one principal may hold
// several. `toMask` turns permission names into a mask, validated against
// the module so a name that does not apply throws instead of encoding junk.
const editor = { Post: perms.toMask('Post', ['READ', 'EDIT']) }; // 3n
const publisher = { Post: perms.toMask('Post', ['PUBLISH']) }; // 8n
const billingViewer = { Billing: perms.toMask('Billing', ['READ']) }; // 1n

// combineGrants ORs the sets — it can only *add* bits, never remove them,
// so stacking roles can never silently strip an already-granted power.
const grants = combineGrants(editor, publisher, billingViewer);
console.log('effective grants', grants); // { Post: 11n, Billing: 1n }
console.log('Post grants render as', perms.toNames('Post', grants.Post!)); // checkboxes

// ── evaluate: has / any / all / assert ───────────────────────────────
console.log('has Post EDIT           ', perms.has('Post', 'EDIT', grants)); // true
console.log('has Post DELETE         ', perms.has('Post', 'DELETE', grants)); // false
console.log(
  'any Post [EDIT, DELETE] ',
  perms.any('Post', ['EDIT', 'DELETE'], grants),
); // true
console.log(
  'all Post [EDIT, DELETE] ',
  perms.all('Post', ['EDIT', 'DELETE'], grants),
); // false

// `assert` is the guard for a route handler: on failure it throws
// PactDeniedError (not a boolean) so a caller maps the denial to a 403.
try {
  perms.assert('Post', 'DELETE', grants);
} catch (err) {
  if (err instanceof PactDeniedError) {
    console.log('assert DELETE denied →', err.code, '-', err.message);
  }
}

// ── edit masks: grant / revoke / diff ────────────────────────────────
// Masks are immutable values — grant/revoke return a *new* BigInt, so an
// admin UI can preview a pending change without mutating the live grant.
const before = grants.Post!; // 11n = READ|EDIT|PUBLISH
const after = perms.revoke(perms.grant(before, 'DELETE'), 'PUBLISH'); // +DELETE −PUBLISH
const delta = perms.diff(before, after);
console.log('before', perms.toNames('Post', before));
console.log('after ', perms.toNames('Post', after));
console.log(
  'diff   added',
  perms.toNames('Post', delta.added),
  'removed',
  perms.toNames('Post', delta.removed),
);

// ── wire round-trip: BigInt masks are not JSON-safe ──────────────────
// Serialize to decimal strings before putting grants in a JWT claim or a
// DB column; deserialize (strictly) after verifying. The strict codec
// rejects hex/negative/empty, so a tampered claim fails loudly.
const wire = serializeGrants(grants);
console.log('serialized', wire); // { Post: '11', Billing: '1' }
const restored = deserializeGrants(wire);
console.log(
  'round-trips',
  restored.Post === grants.Post && restored.Billing === grants.Billing,
); // true

// ── catalog validation: typos are config errors, not denials ─────────
// With a catalog wired, an unknown module or an off-module permission
// throws PactDefinitionError — you learn about the mistake instead of
// getting a silent `false` that quietly locks legitimate users out.
const misconfigured = [
  () => perms.has('NoSuchModule', 'READ', {}), // UNKNOWN_MODULE
  () => perms.has('Billing', 'DELETE', {}), // PERMISSION_NOT_IN_MODULE
];
for (const check of misconfigured) {
  try {
    check();
  } catch (err) {
    if (err instanceof PactDefinitionError) {
      console.log('config error →', err.code, '-', err.message);
    }
  }
}
