/**
 * @fileoverview Tests for bound principals: mint points, freshness,
 * epoch-driven revocation, and the unforgeability properties.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Pact } from './mod.ts';
import { PactError } from './errors/mod.ts';
import { serializeGrants } from './grants.ts';
import type { PactBoundPrincipal, PactPrincipal } from './types/mod.ts';

type Mods = 'Post';
let resolves = 0;
const GRANTS = new Map<string, bigint>([['ada', 3n]]);

const pact = Pact.create({
  bits: { READ: 1n, EDIT: 2n },
  modulePermissions: { Post: ['READ', 'EDIT'] },
  hooks: {
    getPrincipal: (id): PactPrincipal<Mods> | null => {
      resolves++;
      const mask = GRANTS.get(id);
      return mask === undefined
        ? null
        : { kind: 'USER', id, grants: { Post: mask } };
    },
    getApiKey: (id) =>
      id === 'k1'
        ? {
          id: 'k1',
          status: 'ACTIVE',
          secret: 'sk-1',
          grants: serializeGrants({ Post: 1n }),
        }
        : null,
  },
});

function forceStale(bound: PactBoundPrincipal<Mods>): void {
  // deno-lint-ignore no-explicit-any
  (bound as any).__mintedAt = 0;
}

describe('BoundPrincipal', () => {
  describe('minting', () => {
    it('should resolve once and answer fresh checks with no further I/O', async () => {
      resolves = 0;
      const bound = await pact.principalOf('ada');
      asserts.assertExists(bound);
      asserts.assertStrictEquals(resolves, 1);
      for (let i = 0; i < 10; i++) {
        asserts.assert(await bound.hasPermission('Post', 'READ'));
      }
      asserts.assert(await bound.hasPermission('Post', 'EDIT'));
      asserts.assertStrictEquals(resolves, 1, 'fresh checks must not resolve');
    });

    it('should keep the plain principal data intact', async () => {
      const bound = await pact.principalOf('ada');
      asserts.assertStrictEquals(bound?.kind, 'USER');
      asserts.assertStrictEquals(bound?.id, 'ada');
      asserts.assertStrictEquals(bound?.grants.Post, 3n);
    });

    it('should mint nothing for an unknown id', async () => {
      asserts.assertStrictEquals(await pact.principalOf('nobody'), null);
    });

    it('should attach a bound principal on the authenticate context', async () => {
      const ctx = await pact.authenticate({
        scheme: 'APIKEY',
        keyId: 'k1',
        secret: 'sk-1',
      });
      asserts.assertStrictEquals(
        typeof ctx.principal.hasPermission,
        'function',
      );
      await ctx.principal.assert('Post', 'READ');
      const error = await asserts.assertRejects(
        () => ctx.principal.assert('Post', 'EDIT'),
        PactError,
      );
      asserts.assertStrictEquals(error.code, 'PERMISSION_DENIED');
      asserts.assertStringIncludes(error.message, 'k1');
    });
  });

  describe('freshness and revocation', () => {
    it('should surface revocation at the next check after an epoch bump', async () => {
      GRANTS.set('eva', 3n);
      const bound = (await pact.principalOf('eva'))!;
      asserts.assert(await bound.hasPermission('Post', 'EDIT'));
      GRANTS.set('eva', 1n); // app-side revocation of EDIT
      asserts.assert(
        await bound.hasPermission('Post', 'EDIT'),
        'held object sees old grants until epoch/staleness',
      );
      await pact.invalidatePrincipal('eva');
      resolves = 0;
      asserts.assertFalse(await bound.hasPermission('Post', 'EDIT'));
      asserts.assert(await bound.hasPermission('Post', 'READ'));
      asserts.assertStrictEquals(resolves, 1, 'one resolve per refresh');
    });

    it('should self-heal a time-stale object against fresh grants', async () => {
      GRANTS.set('tom', 1n);
      const bound = (await pact.principalOf('tom'))!;
      GRANTS.set('tom', 3n);
      forceStale(bound);
      asserts.assert(await bound.hasPermission('Post', 'EDIT'));
    });

    it('should deny a vanished actor for one window, then retry', async () => {
      GRANTS.set('kim', 1n);
      const bound = (await pact.principalOf('kim'))!;
      GRANTS.delete('kim');
      forceStale(bound);
      resolves = 0;
      asserts.assertFalse(await bound.hasPermission('Post', 'READ'));
      asserts.assertFalse(await bound.hasPermission('Post', 'READ'));
      asserts.assertStrictEquals(
        resolves,
        1,
        'the null verdict holds for the window without re-resolving',
      );
      GRANTS.set('kim', 1n);
      forceStale(bound);
      asserts.assert(
        await bound.hasPermission('Post', 'READ'),
        'a reactivated actor recovers',
      );
    });
  });

  describe('unforgeability', () => {
    it('should not carry the capability through structured clone', async () => {
      const bound = (await pact.principalOf('ada'))!;
      let stripped = true;
      try {
        const clone = structuredClone(bound) as { hasPermission?: unknown };
        stripped = typeof clone.hasPermission !== 'function';
      } catch {
        // A DataCloneError equally means the proof did not cross.
      }
      asserts.assert(stripped);
    });

    it('should fail closed for a prototype-grafted forgery', async () => {
      const bound = (await pact.principalOf('ada'))!;
      const forged = Object.assign(
        Object.create(Object.getPrototypeOf(bound)),
        {
          kind: 'USER',
          id: 'admin',
          __grants: { Post: 3n },
          __mintedAt: Date.now(),
          __epoch: 0,
        },
      ) as PactBoundPrincipal<Mods>;
      asserts.assertFalse(await forged.hasPermission('Post', 'READ'));
    });

    it('should keep definition misuse loud through the bound path', async () => {
      const bound = (await pact.principalOf('ada'))!;
      const error = await asserts.assertRejects(
        () => bound.hasPermission('Nope' as Mods, 'READ'),
        PactError,
      );
      asserts.assertStrictEquals(error.code, 'UNKNOWN_MODULE');
    });
  });
});
