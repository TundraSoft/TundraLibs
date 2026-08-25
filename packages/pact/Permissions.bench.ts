/**
 * @fileoverview Benchmarks for the bitmask permission engine — the
 * per-request authorization hot path.
 *
 * @module
 */

import { bench } from '@tundralibs/compat/bench';
import { Permissions } from './Permissions.ts';

// =============================================================================
// Setup — a realistic registry, catalog, and a principal's grants
// =============================================================================

const bits = {
  READ: 1n,
  CREATE: 2n,
  EDIT: 4n,
  DELETE: 8n,
  PUBLISH: 16n,
  ARCHIVE: 32n,
  EXPORT: 64n,
  ADMIN: 128n,
};

const withCatalog = new Permissions(bits, {
  Post: ['READ', 'CREATE', 'EDIT', 'DELETE', 'PUBLISH', 'ARCHIVE'],
  Billing: ['READ', 'EXPORT'],
  Users: ['READ', 'CREATE', 'EDIT', 'DELETE', 'ADMIN'],
});

const noCatalog = new Permissions(bits);

// Post: READ|CREATE|EDIT (7n); Billing: READ; Users: READ.
const grants = { Post: 7n, Billing: 1n, Users: 1n };

// =============================================================================
// Benchmarks — evaluation (the guard runs once per protected request)
// =============================================================================

bench({
  name: 'pact.Permissions - has (hit, catalog)',
  fn: () => {
    withCatalog.has('Post', 'EDIT', grants);
  },
});

bench({
  name: 'pact.Permissions - has (miss, catalog)',
  fn: () => {
    withCatalog.has('Post', 'DELETE', grants);
  },
});

bench({
  name: 'pact.Permissions - has (no catalog)',
  fn: () => {
    noCatalog.has('Post', 'EDIT', grants);
  },
});

bench({
  name: 'pact.Permissions - assert (granted)',
  fn: () => {
    withCatalog.assert('Post', 'EDIT', grants);
  },
});

bench({
  name: 'pact.Permissions - any (3 permissions)',
  fn: () => {
    withCatalog.any('Post', ['DELETE', 'PUBLISH', 'EDIT'], grants);
  },
});

// =============================================================================
// Benchmarks — mask editing (admin/permission-management paths)
// =============================================================================

bench({
  name: 'pact.Permissions - grant (3 permissions)',
  fn: () => {
    withCatalog.grant(0n, 'READ', 'EDIT', 'DELETE');
  },
});

bench({
  name: 'pact.Permissions - revoke',
  fn: () => {
    withCatalog.revoke(15n, 'EDIT');
  },
});

bench({
  name: 'pact.Permissions - toMask',
  fn: () => {
    withCatalog.toMask('Post', ['READ', 'EDIT', 'PUBLISH']);
  },
});

bench({
  name: 'pact.Permissions - toNames',
  fn: () => {
    withCatalog.toNames('Post', 7n);
  },
});
