/**
 * @fileoverview Tests for the Doctor injector and end-to-end DI flows.
 *
 * Injection is construction-time (`inject()` field initializers and
 * constructor default parameters) — no metadata emission — so unlike
 * the 1.x suite these tests run on Deno, Bun, AND Node.
 *
 * @module
 */

import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, inject, Vial } from './mod.ts';
import {
  CircularDependencyError,
  DuplicateVialError,
  ScopeRequiredError,
  UnregisteredVialError,
} from './errors/mod.ts';

// Local vials. Registered per-test via `prescribe` (after `reset`), so
// nothing here depends on import order or cross-file registry state.
class DLogger {
  public lines: string[] = [];
  public log(msg: string): void {
    this.lines.push(msg);
  }
}

class DDb {
  constructor(public readonly conn: string = 'default') {}
}

// Stand in for the generated registry so `inject('...')` is typed.
declare module './mod.ts' {
  interface VialRegistry {
    DLogger: DLogger;
    DDb: DDb;
    DCyA: unknown;
    DCyB: unknown;
    DMissing: unknown;
    DGoodScoped: unknown;
  }
}

describe('Doctor', () => {
  describe('Basic lifecycle', () => {
    it('should cache SINGLETON, isolate SCOPED per scope, and rebuild TRANSIENT', () => {
      Doctor.reset();
      class S {}
      class Sc {}
      class T {}
      Doctor.prescribe(S, 'SINGLETON');
      Doctor.prescribe(Sc, 'SCOPED');
      Doctor.prescribe(T, 'TRANSIENT');

      asserts.assertStrictEquals(Doctor.dispense(S), Doctor.dispense(S));

      const a1 = Doctor.dispense(Sc, 'a');
      const a2 = Doctor.dispense(Sc, 'a');
      const b1 = Doctor.dispense(Sc, 'b');
      asserts.assertStrictEquals(a1, a2);
      asserts.assert(a1 !== b1);

      asserts.assert(Doctor.dispense(T) !== Doctor.dispense(T));
    });

    it('should wire dependencies during construction (field + constructor default)', () => {
      Doctor.reset();
      Doctor.prescribe(DLogger, 'SINGLETON');
      class Service {
        logger = inject('DLogger');
        constructor(public also = inject('DLogger')) {}
      }
      Doctor.prescribe(Service, 'SINGLETON');
      const svc = Doctor.dispense(Service);
      asserts.assert(svc.logger instanceof DLogger);
      asserts.assertStrictEquals(svc.logger, svc.also);
      asserts.assertStrictEquals(svc.logger, Doctor.dispense(DLogger));
    });

    it('should cascade through nested resolutions', () => {
      Doctor.reset();
      Doctor.prescribe(DLogger, 'SINGLETON');
      class Repo {
        logger = inject('DLogger');
      }
      Doctor.prescribe(Repo, 'TRANSIENT');
      class Handler {
        repo = new Repo(); // plain new inside construction still wires
        logger = inject('DLogger');
      }
      Doctor.prescribe(Handler, 'TRANSIENT');
      const h = Doctor.dispense(Handler);
      asserts.assertStrictEquals(h.repo.logger, h.logger);
    });
  });

  describe('Error handling', () => {
    it('should throw UnregisteredVialError for unregistered classes and tokens', () => {
      Doctor.reset();
      class Nope {}
      asserts.assertThrows(
        () => Doctor.dispense(Nope),
        UnregisteredVialError,
      );
      asserts.assertThrows(
        () => Doctor.dispenseByName('Nope'),
        UnregisteredVialError,
      );
    });

    it('should throw ScopeRequiredError when a SCOPED vial gets no scope', () => {
      Doctor.reset();
      Doctor.prescribe(DDb, 'SCOPED');
      asserts.assertThrows(() => Doctor.dispense(DDb), ScopeRequiredError);
    });

    it('should throw DuplicateVialError on double registration', () => {
      Doctor.reset();
      Doctor.prescribe(DLogger, 'SINGLETON');
      asserts.assertThrows(
        () => Doctor.prescribe(DLogger, 'TRANSIENT'),
        DuplicateVialError,
      );
    });
  });

  describe('Scope management', () => {
    it('should isolate scopes and support discharge/dischargeAll', () => {
      Doctor.reset();
      Doctor.prescribe(DDb, 'SCOPED');
      const a = Doctor.dispense(DDb, 'req-a');
      const b = Doctor.dispense(DDb, 'req-b');
      asserts.assert(a !== b);

      asserts.assertEquals(Doctor.discharge('req-a'), true);
      asserts.assertEquals(Doctor.discharge('req-a'), false); // already gone
      const a2 = Doctor.dispense(DDb, 'req-a');
      asserts.assert(a2 !== a);

      Doctor.dischargeAll();
      const b2 = Doctor.dispense(DDb, 'req-b');
      asserts.assert(b2 !== b);
    });
  });

  describe('knows()', () => {
    it('should report registered and unregistered classes correctly', () => {
      Doctor.reset();
      class Known {}
      class Unknown {}
      Doctor.prescribe(Known, 'SINGLETON');
      asserts.assertEquals(Doctor.knows(Known), true);
      asserts.assertEquals(Doctor.knows(Unknown), false);
    });
  });

  describe('Factory hook', () => {
    it('should call the registered factory instead of new', () => {
      Doctor.reset();
      let calls = 0;
      Doctor.prescribe(DDb, {
        mode: 'SINGLETON',
        factory: () => {
          calls++;
          return new DDb('from-factory');
        },
      });
      const db = Doctor.dispense(DDb);
      asserts.assertEquals(db.conn, 'from-factory');
      Doctor.dispense(DDb);
      asserts.assertEquals(calls, 1); // singleton: factory ran once
    });

    it('should cache a factory result even when it is falsy', () => {
      Doctor.reset();
      let calls = 0;
      class NullVial {}
      Doctor.prescribe(NullVial, {
        mode: 'SINGLETON',
        factory: () => {
          calls++;
          return null;
        },
      });
      asserts.assertEquals(Doctor.dispense(NullVial), null);
      asserts.assertEquals(Doctor.dispense(NullVial), null);
      asserts.assertEquals(calls, 1);
    });
  });

  describe('resolve()', () => {
    it('should construct a fresh instance every time, even for SINGLETON registrations', () => {
      Doctor.reset();
      Doctor.prescribe(DLogger, 'SINGLETON');
      const a = Doctor.resolve(DLogger);
      const b = Doctor.resolve(DLogger);
      asserts.assert(a !== b);
      // ...and never touches the dispense cache.
      const c = Doctor.dispense(DLogger);
      asserts.assert(c !== a && c !== b);
    });

    it('should honour a registered factory instead of a bare new', () => {
      Doctor.reset();
      Doctor.prescribe(DDb, {
        mode: 'TRANSIENT',
        factory: () => new DDb('via-factory'),
      });
      asserts.assertEquals(Doctor.resolve(DDb).conn, 'via-factory');
    });
  });

  describe('Ambient operation scope', () => {
    it('should thread resolve()’s scope into inject() during construction', () => {
      Doctor.reset();
      Doctor.prescribe(DDb, 'SCOPED');
      class Handler {
        db = inject('DDb'); // no scope of its own
      }
      const h1 = Doctor.resolve(Handler, 'req-1');
      const h2 = Doctor.resolve(Handler, 'req-1');
      const h3 = Doctor.resolve(Handler, 'req-2');
      asserts.assertStrictEquals(h1.db, h2.db); // same scope shares
      asserts.assert(h1.db !== h3.db); // different scope differs
    });

    it('should let an explicit inject() scope win over the ambient one', () => {
      Doctor.reset();
      Doctor.prescribe(DDb, 'SCOPED');
      class Handler {
        pinned = inject('DDb', 'pinned-scope');
        ambient = inject('DDb');
      }
      const h = Doctor.resolve(Handler, 'req-1');
      asserts.assert(h.pinned !== h.ambient);
      asserts.assertStrictEquals(
        h.pinned,
        Doctor.dispense(DDb, 'pinned-scope'),
      );
    });

    it('should expose no ambient scope outside an operation', () => {
      Doctor.reset();
      Doctor.prescribe(DDb, 'SCOPED');
      class Handler {
        db = inject('DDb');
      }
      // Plain `new` runs outside any Doctor operation: no ambient
      // fallback exists, so the SCOPED dependency fails loudly.
      asserts.assertThrows(() => new Handler(), ScopeRequiredError);
    });

    it('should clear the ambient scope once the operation finishes', () => {
      Doctor.reset();
      Doctor.prescribe(DDb, 'SCOPED');
      class Handler {
        db = inject('DDb');
      }
      Doctor.resolve(Handler, 'req-1'); // completes fine
      // The previous operation's scope must not leak into this call.
      asserts.assertThrows(
        () => Doctor.dispenseByName('DDb'),
        ScopeRequiredError,
      );
    });
  });

  describe('Circular dependencies', () => {
    it('should throw CircularDependencyError for an eager SINGLETON <-> SINGLETON cycle', () => {
      Doctor.reset();
      class DCyA {
        b = inject('DCyB');
      }
      class DCyB {
        a = inject('DCyA');
      }
      Doctor.prescribe(DCyA, 'SINGLETON');
      Doctor.prescribe(DCyB, 'SINGLETON');
      asserts.assertThrows(
        () => Doctor.dispense(DCyA),
        CircularDependencyError,
      );
      // Nothing half-built was cached: the retry throws identically.
      asserts.assertThrows(
        () => Doctor.dispense(DCyA),
        CircularDependencyError,
      );
    });

    it('should resolve a SINGLETON <-> SINGLETON cycle when one side is a lazy getter', () => {
      Doctor.reset();
      class DCyA {
        // deno-lint-ignore no-explicit-any
        private __b?: any;
        // deno-lint-ignore no-explicit-any
        get b(): any {
          return this.__b ??= inject('DCyB');
        }
      }
      class DCyB {
        a = inject('DCyA'); // eager side
      }
      Doctor.prescribe(DCyA, 'SINGLETON');
      Doctor.prescribe(DCyB, 'SINGLETON');
      const a = Doctor.dispense(DCyA);
      asserts.assert(a.b instanceof DCyB);
      asserts.assertStrictEquals(a.b.a, a);
      asserts.assertStrictEquals(a.b, a.b); // memoized
    });

    it('should throw CircularDependencyError for a TRANSIENT self-cycle', () => {
      Doctor.reset();
      class DCyA {
        self = inject('DCyA');
      }
      Doctor.prescribe(DCyA, 'TRANSIENT');
      asserts.assertThrows(
        () => Doctor.dispense(DCyA),
        CircularDependencyError,
      );
    });

    it('should throw CircularDependencyError for a factory cycle', () => {
      Doctor.reset();
      class DCyA {}
      Doctor.prescribe(DCyA, {
        mode: 'SINGLETON',
        factory: () => Doctor.dispense(DCyA),
      });
      asserts.assertThrows(
        () => Doctor.dispense(DCyA),
        CircularDependencyError,
      );
    });
  });

  describe('Construction-failure retry', () => {
    it('should not cache a SINGLETON whose construction failed, and retry cleanly', () => {
      Doctor.reset();
      class Service {
        dep = inject('DMissing');
      }
      Doctor.prescribe(Service, 'SINGLETON');
      asserts.assertThrows(
        () => Doctor.dispense(Service),
        UnregisteredVialError,
      );
      // Register the missing dependency, then retry — a half-built
      // instance must not have been cached by the failed attempt.
      class DMissing {}
      Doctor.prescribe(DMissing, 'SINGLETON');
      const svc = Doctor.dispense(Service);
      asserts.assert(svc.dep instanceof DMissing);
    });
  });

  describe('SCOPED failure does not leak scope maps', () => {
    it('should prune a freshly-created scope when the factory throws', () => {
      Doctor.reset();
      class Bad {}
      Doctor.prescribe(Bad, {
        mode: 'SCOPED',
        factory: () => {
          throw new Error('nope');
        },
      });
      asserts.assertThrows(() => Doctor.dispense(Bad, 'fresh-scope'));
      // The failed operation owned 'fresh-scope' and dropped it.
      asserts.assertEquals(Doctor.discharge('fresh-scope'), false);
    });

    it('should drop the whole owned scope even when a healthy SCOPED sibling was built first', () => {
      Doctor.reset();
      class DGoodScoped {}
      Doctor.prescribe(DGoodScoped, 'SCOPED');
      class Outer {
        good = inject('DGoodScoped'); // builds fine into the scope
        bad = inject('DMissing'); // then this throws
      }
      Doctor.prescribe(Outer, 'SCOPED');
      asserts.assertThrows(
        () => Doctor.dispense(Outer, 'doomed'),
        UnregisteredVialError,
      );
      // The frame owned 'doomed', so the sibling went with it.
      asserts.assertEquals(Doctor.discharge('doomed'), false);
    });

    it('should leave a pre-existing scope intact when a later operation into it fails', () => {
      Doctor.reset();
      class DGoodScoped {}
      Doctor.prescribe(DGoodScoped, 'SCOPED');
      const kept = Doctor.dispense(DGoodScoped, 'stable'); // scope now exists
      class Broken {
        dep = inject('DMissing');
      }
      Doctor.prescribe(Broken, 'SCOPED');
      asserts.assertThrows(() => Doctor.dispense(Broken, 'stable'));
      // 'stable' pre-existed the failing frame — never owned, never dropped.
      asserts.assertStrictEquals(Doctor.dispense(DGoodScoped, 'stable'), kept);
    });
  });

  describe('checkup()', () => {
    it('should eagerly dispense every SINGLETON and report the count', () => {
      Doctor.reset();
      let built = 0;
      class S1 {
        constructor() {
          built++;
        }
      }
      class S2 {
        constructor() {
          built++;
        }
      }
      class Sc {
        constructor() {
          built++;
        }
      }
      class T {
        constructor() {
          built++;
        }
      }
      Doctor.prescribe(S1, 'SINGLETON');
      Doctor.prescribe(S2, 'SINGLETON');
      Doctor.prescribe(Sc, 'SCOPED'); // skipped: no scope to resolve under
      Doctor.prescribe(T, 'TRANSIENT'); // skipped: nothing to warm
      asserts.assertEquals(Doctor.checkup(), 2);
      asserts.assertEquals(built, 2);
      // Idempotent: singletons are already cached.
      asserts.assertEquals(Doctor.checkup(), 2);
      asserts.assertEquals(built, 2);
    });

    it('should surface the first failing SINGLETON loudly', () => {
      Doctor.reset();
      class Broken {
        dep = inject('DMissing');
      }
      Doctor.prescribe(Broken, 'SINGLETON');
      asserts.assertThrows(() => Doctor.checkup(), UnregisteredVialError);
    });
  });

  describe('revoke()', () => {
    it('should clear the registration, singleton cache, and scopes', () => {
      Doctor.reset();
      Doctor.prescribe(DLogger, 'SINGLETON');
      const first = Doctor.dispense(DLogger);
      asserts.assertEquals(Doctor.revoke(DLogger), true);
      asserts.assertEquals(Doctor.knows(DLogger), false);
      asserts.assertThrows(() => Doctor.dispense(DLogger));
      // Re-register: the old cached instance must be gone.
      Doctor.prescribe(DLogger, 'SINGLETON');
      asserts.assert(Doctor.dispense(DLogger) !== first);
    });

    it('should return false for a class that was never registered', () => {
      Doctor.reset();
      class Never {}
      asserts.assertEquals(Doctor.revoke(Never), false);
    });
  });

  describe('@Vial registration', () => {
    it('should register at decoration time with the given mode', () => {
      Doctor.reset();
      @Vial('SINGLETON')
      class Decorated {}
      asserts.assertEquals(Doctor.knows(Decorated), true);
      asserts.assertStrictEquals(
        Doctor.dispense(Decorated),
        Doctor.dispense(Decorated),
      );
    });
  });
});
