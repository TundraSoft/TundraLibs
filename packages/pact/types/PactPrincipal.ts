/**
 * @fileoverview Runtime principal for `@tundralibs/pact` — the secret-free
 * identity `verify`/`authenticate` resolve and `can`/`assert` check.
 *
 * @module
 */

import type { PactGrants } from './PactGrants.ts';

/** Secret-free principal; masks deserialized to live BigInts. */
export type PactPrincipal = {
  id: string;
  /** Effective per-module masks. */
  grants: PactGrants;
  status: 'ACTIVE' | 'LOCKED' | 'DISABLED';
  metadata: Record<string, unknown>;
};
