import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Permissions } from './Permissions.ts';
import { PactDefinitionError, PactDeniedError } from './errors/mod.ts';

const BITS = { READ: 1n, EDIT: 2n, DELETE: 4n, PUBLISH: 8n } as const;

describe('pact.Permissions', () => {
  it('constructs and exposes bits + module names', () => {
    const p = new Permissions(BITS, {
      Post: ['READ', 'EDIT'],
      Billing: ['READ'],
    });
    asserts.assertEquals(p.bits.READ, 1n);
    asserts.assertEquals([...p.modules].sort(), ['Billing', 'Post']);
    asserts.assertEquals(new Permissions(BITS).modules, []);
  });

  it('resolve: name → bit, BigInt passthrough, unknown name throws', () => {
    const p = new Permissions(BITS);
    asserts.assertEquals(p.resolve('EDIT'), 2n);
    asserts.assertEquals(p.resolve(16n), 16n);
    asserts.assertThrows(
      () => p.resolve('NOPE' as never),
      PactDefinitionError,
    );
  });

  it('has / any / all evaluate grants', () => {
    const p = new Permissions(BITS, {
      Post: ['READ', 'EDIT', 'DELETE', 'PUBLISH'],
      Billing: ['READ'],
    });
    const grants = { Post: 3n }; // READ|EDIT on Post; nothing on Billing
    asserts.assert(p.has('Post', 'READ', grants));
    asserts.assertFalse(p.has('Post', 'DELETE', grants));
    asserts.assertFalse(p.has('Billing', 'READ', grants)); // in catalog, no grant
    asserts.assert(p.any('Post', ['DELETE', 'READ'], grants));
    asserts.assertFalse(p.any('Post', ['DELETE', 'PUBLISH'], grants));
    asserts.assert(p.all('Post', ['READ', 'EDIT'], grants));
    asserts.assertFalse(p.all('Post', ['READ', 'DELETE'], grants));
    // empty-set semantics: any → false, all → true
    asserts.assertFalse(p.any('Post', [], grants));
    asserts.assert(p.all('Post', [], grants));
  });

  it('has works without a catalog (free-form module keys)', () => {
    const p = new Permissions(BITS);
    asserts.assert(p.has('AnythingGoes', 'EDIT', { AnythingGoes: 2n }));
    asserts.assertFalse(p.has('AnythingGoes', 'EDIT', {}));
  });

  it('assert throws PactDeniedError when denied, is silent when granted', () => {
    const p = new Permissions(BITS);
    p.assert('Post', 'READ', { Post: 1n }); // no throw
    const err = asserts.assertThrows(
      () => p.assert('Post', 'DELETE', { Post: 1n }),
      PactDeniedError,
    );
    asserts.assertEquals((err as PactDeniedError).code, 'PERMISSION_DENIED');
  });

  it('grant / revoke / diff — BigInt mask math', () => {
    const p = new Permissions(BITS);
    asserts.assertEquals(p.grant(0n, 'READ', 'EDIT'), 3n);
    asserts.assertEquals(p.revoke(7n, 'EDIT'), 5n); // 0b111 & ~0b010 = 0b101
    asserts.assertEquals(p.diff(3n, 6n), { added: 4n, removed: 1n });
  });

  it('toNames / toMask round-trip within a module', () => {
    const p = new Permissions(BITS, { Post: ['READ', 'EDIT', 'DELETE'] });
    asserts.assertEquals(p.toNames('Post', 3n), ['READ', 'EDIT']);
    asserts.assertEquals(p.toMask('Post', ['READ', 'DELETE']), 5n);
  });

  it('catalog validation: unknown module + inapplicable permission throw', () => {
    const p = new Permissions(BITS, { Post: ['READ', 'EDIT'] });
    asserts.assertThrows(() => p.has('Ghost', 'READ', {}), PactDefinitionError);
    asserts.assertThrows(
      () => p.has('Post', 'DELETE', {}), // DELETE not applicable to Post
      PactDefinitionError,
    );
  });

  it('rejects duplicate + non-positive bits at construction', () => {
    asserts.assertThrows(
      () => new Permissions({ A: 1n, B: 1n }),
      PactDefinitionError,
    );
    asserts.assertThrows(() => new Permissions({ A: 0n }), PactDefinitionError);
    asserts.assertThrows(
      () => new Permissions({ A: -2n }),
      PactDefinitionError,
    );
  });

  it('supports permissions past the 53-bit Number ceiling (unbounded BigInt)', () => {
    const big = 1n << 60n;
    const p = new Permissions({ HUGE: big }, { Mod: ['HUGE'] });
    asserts.assert(p.has('Mod', 'HUGE', { Mod: big }));
    asserts.assertFalse(p.has('Mod', 'HUGE', { Mod: 0n }));
    asserts.assertEquals(p.toMask('Mod', ['HUGE']), big);
  });
});

describe('pact.Permissions edge paths', () => {
  it('construction rejects a module referencing an unknown permission', () => {
    asserts.assertThrows(
      () => new Permissions(BITS, { M: ['GHOST' as never] }),
      PactDefinitionError,
    );
  });

  it('no catalog: raw 0n is vacuously satisfied; toNames uses all registry names', () => {
    const p = new Permissions(BITS);
    asserts.assert(p.has('AnyMod', 0n, {}));
    asserts.assertEquals(p.toNames('AnyMod', 3n).sort(), ['EDIT', 'READ']);
  });

  it('toNames on an unknown module (with a catalog) throws', () => {
    const p = new Permissions(BITS, { Post: ['READ'] });
    asserts.assertThrows(() => p.toNames('Ghost', 1n), PactDefinitionError);
  });
});

// The prototype-key hardening applied to the grants helpers (grants.ts, [F2])
// must extend to the Permissions engine: a permission/module reference that
// collides with an `Object.prototype` member ('toString', 'constructor',
// 'hasOwnProperty', 'valueOf', '__proto__') must never resolve to an inherited
// member — which would bypass the UNKNOWN_PERMISSION guard and then crash the
// BigInt bit math with a raw `TypeError: Cannot mix BigInt and other types`.
describe('pact.Permissions prototype-safety [F2]', () => {
  const PROTO_NAMES = [
    'toString',
    'constructor',
    'hasOwnProperty',
    'valueOf',
    '__proto__',
  ] as const;

  it('resolve(): a prototype-named permission is UNKNOWN_PERMISSION, not an inherited member', () => {
    const p = new Permissions(BITS);
    for (const name of PROTO_NAMES) {
      const err = asserts.assertThrows(
        () => p.resolve(name as never),
        PactDefinitionError,
      );
      asserts.assertEquals(
        (err as PactDefinitionError).code,
        'UNKNOWN_PERMISSION',
      );
    }
  });

  it('grant()/revoke(): a prototype-named permission throws instead of mixing BigInt + function', () => {
    const p = new Permissions(BITS);
    asserts.assertThrows(
      () => p.grant(0n, 'toString' as never),
      PactDefinitionError,
    );
    asserts.assertThrows(
      () => p.revoke(7n, '__proto__' as never),
      PactDefinitionError,
    );
  });

  it('has(): a prototype-named PERMISSION throws UNKNOWN_PERMISSION (never a raw TypeError)', () => {
    const p = new Permissions(BITS);
    for (const name of PROTO_NAMES) {
      const err = asserts.assertThrows(
        () => p.has('Post', name as never, { Post: 1n }),
        PactDefinitionError,
      );
      asserts.assertEquals(
        (err as PactDefinitionError).code,
        'UNKNOWN_PERMISSION',
      );
    }
  });

  it('has(): a prototype-named MODULE reads the own grant, not Object.prototype', () => {
    const p = new Permissions(BITS); // no catalog → free-form module keys
    // `grants` is a caller-supplied plain (Object.prototype-backed) object;
    // `grants['constructor']` must not resolve to the inherited constructor
    // function (→ `held & bit` TypeError). No own grant → a clean `false`.
    asserts.assertFalse(p.has('constructor', 'READ', { Post: 1n }));
    asserts.assertFalse(p.has('hasOwnProperty', 'READ', { Post: 1n }));
    asserts.assertFalse(p.has('__proto__', 'READ', { Post: 1n }));
    // An actual own grant on the prototype-named module is honoured.
    asserts.assert(p.has('constructor', 'READ', { constructor: 1n }));
    asserts.assert(p.has('toString', 'EDIT', { toString: 2n }));
  });

  it('has(): with a catalog, a prototype-named module is UNKNOWN_MODULE (not a TypeError)', () => {
    const p = new Permissions(BITS, { Post: ['READ'] });
    const err = asserts.assertThrows(
      () => p.has('constructor', 'READ', {}),
      PactDefinitionError,
    );
    asserts.assertEquals((err as PactDefinitionError).code, 'UNKNOWN_MODULE');
  });

  it('construction: a module referencing a prototype-named permission throws UNKNOWN_PERMISSION', () => {
    const err = asserts.assertThrows(
      () => new Permissions(BITS, { M: ['toString' as never] }),
      PactDefinitionError,
    );
    asserts.assertEquals(
      (err as PactDefinitionError).code,
      'UNKNOWN_PERMISSION',
    );
  });

  it('a legitimately registered prototype-named permission still works end-to-end', () => {
    const p = new Permissions(
      { toString: 1n, constructor: 2n, valueOf: 4n },
      { Mod: ['toString', 'constructor', 'valueOf'] },
    );
    asserts.assertEquals(p.resolve('toString'), 1n);
    asserts.assertEquals(p.resolve('constructor'), 2n);
    asserts.assertEquals(p.bits.toString, 1n); // own prop, not the method
    asserts.assert(p.has('Mod', 'toString', { Mod: 3n }));
    asserts.assert(p.has('Mod', 'constructor', { Mod: 3n }));
    asserts.assertFalse(p.has('Mod', 'valueOf', { Mod: 3n }));
    asserts.assertEquals(
      p.toNames('Mod', 3n).sort(),
      ['constructor', 'toString'],
    );
    asserts.assertEquals(p.toMask('Mod', ['valueOf']), 4n);
  });
});
