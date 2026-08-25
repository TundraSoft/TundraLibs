import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { combineGrants, deserializeGrants, serializeGrants } from './grants.ts';
import { PactDefinitionError } from './errors/mod.ts';

describe('pact.grants', () => {
  it('combineGrants ORs masks and skips undefined sets', () => {
    const combined = combineGrants(
      { Post: 1n },
      undefined,
      { Post: 2n, Billing: 4n },
    );
    asserts.assertEquals(combined.Post, 3n);
    asserts.assertEquals(combined.Billing, 4n);
    asserts.assertEquals(combineGrants(), {});
  });

  it('serialize → deserialize round-trips masks as decimal strings', () => {
    const grants = { Post: 6n, Huge: 1n << 80n };
    const wire = serializeGrants(grants);
    asserts.assertEquals(wire.Post, '6');
    asserts.assertEquals(deserializeGrants(wire), grants);
  });

  it('deserialize accepts numbers and BigInts, rejects malformed values', () => {
    asserts.assertEquals(deserializeGrants({ A: 5, B: 7n }).A, 5n);
    for (const bad of ['', ' 5', '0x1F', '1.5', '-3', 'abc']) {
      const err = asserts.assertThrows(
        () => deserializeGrants({ M: bad }),
        PactDefinitionError,
      );
      asserts.assertEquals(
        (err as PactDefinitionError).code,
        'INVALID_GRANTS',
      );
    }
    asserts.assertThrows(
      () => deserializeGrants({ M: -1 }),
      PactDefinitionError,
    );
  });

  it("a '__proto__' module round-trips as an own property [F2]", () => {
    const wire = serializeGrants({ ['__proto__']: 3n });
    asserts.assertEquals(wire['__proto__'], '3');
    const back = deserializeGrants(wire);
    asserts.assertEquals(back['__proto__'], 3n);
    const combined = combineGrants(back, { ['__proto__']: 4n });
    asserts.assertEquals(combined['__proto__'], 7n);
  });

  it('deserializeGrants rejects a negative BigInt mask → INVALID_GRANTS', () => {
    const err = asserts.assertThrows(
      () => deserializeGrants({ Post: -3n }),
      PactDefinitionError,
    );
    asserts.assertEquals((err as { code?: string }).code, 'INVALID_GRANTS');
  });
});
