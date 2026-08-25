/**
 * @fileoverview Benchmarks for the grants codec — the (de)serialization run
 * on every embed-grants login/verify, and the OR-merge.
 *
 * @module
 */

import { bench } from '@tundralibs/compat/bench';
import { combineGrants, deserializeGrants, serializeGrants } from './grants.ts';

// =============================================================================
// Setup — data built once, outside the measured functions
// =============================================================================

const grants = { Post: 7n, Billing: 1n, Users: 129n, Reports: 3n };
const wireStrings = { Post: '7', Billing: '1', Users: '129', Reports: '3' };
const wireBigints = { Post: 7n, Billing: 1n, Users: 129n, Reports: 3n };

const setA = { Post: 1n, Billing: 1n };
const setB = { Post: 6n, Users: 128n };
const setC = { Reports: 3n, Post: 8n };

// =============================================================================
// Benchmarks
// =============================================================================

bench({
  name: 'pact.grants - serializeGrants (4 modules)',
  fn: () => {
    serializeGrants(grants);
  },
});

bench({
  name: 'pact.grants - deserializeGrants (decimal strings)',
  fn: () => {
    deserializeGrants(wireStrings);
  },
});

bench({
  name: 'pact.grants - deserializeGrants (bigints)',
  fn: () => {
    deserializeGrants(wireBigints);
  },
});

bench({
  name: 'pact.grants - combineGrants (3 sets)',
  fn: () => {
    combineGrants(setA, setB, setC);
  },
});
