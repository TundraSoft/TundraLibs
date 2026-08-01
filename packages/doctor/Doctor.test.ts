/**
 * @fileoverview Tests for the Doctor injector and end-to-end DI flows.
 * @module
 */

// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, Dose, Inoculate, Vial } from './mod.ts';
import {
  CircularDependencyError,
  DuplicateVialError,
  ScopeRequiredError,
  UnregisteredVialError,
} from './errors/mod.ts';

describe({
  name: 'Doctor',
  // Doctor's DI reads each property's `design:type` via reflect-metadata, which
  // TypeScript emits only under emitDecoratorMetadata. Deno and Bun honor the
  // tsconfig flag; tsx/esbuild (the Node test runner) cannot emit it, so these
  // run on Deno and Bun only.
  node: false,
  fn: () => {
    // Mutual references make `@Dose()` brittle (one side is always a
    // forward reference at decoration time), so the cycle and
    // treat-failure cases below wire the `design:injectable` metadata
    // by hand — the same approach the optional-dependency test uses.
    const wire = (from: any, key: string, type: any, optional = false) => {
      const meta = Reflect.getMetadata('design:injectable', from) ?? [];
      meta.push({ key, type, optional });
      Reflect.defineMetadata('design:injectable', meta, from);
    };

    describe('Basic dependency injection', () => {
      it('should resolve singleton, scoped, and transient vials', () => {
        @Vial('SINGLETON')
        class SingletonService {
          public value = 'test';
        }
        @Vial('TRANSIENT')
        class TransientService {
          public value = 'test';
        }
        @Vial('SCOPED')
        class ScopedService {
          public value = 'test';
        }

        @Inoculate('SCOPE1')
        class TestService1 {
          @Dose()
          public singletonService!: SingletonService;
          @Dose()
          public transientService!: TransientService;
          @Dose()
          public scopedService!: ScopedService;
        }

        @Inoculate('SCOPE1')
        class TestService2 {
          @Dose()
          public singletonService!: SingletonService;
          @Dose()
          public transientService!: TransientService;
          @Dose()
          public scopedService!: ScopedService;
        }

        @Inoculate('SCOPE2')
        class TestService3 {
          @Dose()
          public singletonService!: SingletonService;
          @Dose()
          public transientService!: TransientService;
          @Dose()
          public scopedService!: ScopedService;
        }

        const t1 = new TestService1();
        const t2 = new TestService2();
        const t3 = new TestService3();

        // Singleton — same instance everywhere, regardless of scope.
        asserts.assertStrictEquals(t1.singletonService, t2.singletonService);
        t1.singletonService.value = 'changed';
        asserts.assertEquals(t2.singletonService.value, 'changed');
        asserts.assertEquals(t3.singletonService.value, 'changed');

        // Scoped — shared inside one scope, isolated between scopes.
        asserts.assertStrictEquals(t1.scopedService, t2.scopedService);
        t1.scopedService.value = 'changed';
        asserts.assertEquals(t2.scopedService.value, 'changed');
        asserts.assertEquals(t3.scopedService.value, 'test');

        // Transient — independent instance per resolution.
        t1.transientService.value = 'changed';
        t3.transientService.value = 'am changed too';
        asserts.assertEquals(t2.transientService.value, 'test');
        asserts.assertNotEquals(
          t1.transientService.value,
          t3.transientService.value,
        );
      });
    });

    describe('Error handling', () => {
      it('should throw UnregisteredVialError for unregistered services', () => {
        @Inoculate('SCOPE_ERR')
        class NoDeps {
          @Dose()
          public nonRegisteredService!: { value: string };
        }

        asserts.assertThrows(
          () => new NoDeps(),
          UnregisteredVialError,
          'No service registered for',
        );
      });
    });

    describe('Scope management', () => {
      it('should isolate scopes and support discharge/dischargeAll', () => {
        @Vial('SCOPED')
        class ScopedService {
          public value = 'test';
        }

        @Inoculate('SCOPE_A')
        class ServiceA {
          @Dose()
          public scopedService!: ScopedService;
        }

        @Inoculate('SCOPE_B')
        class ServiceB {
          @Dose()
          public scopedService!: ScopedService;
        }

        const a1 = new ServiceA();
        const a2 = new ServiceA();
        const b1 = new ServiceB();

        a1.scopedService.value = 'modified in A';
        asserts.assertEquals(a1.scopedService.value, a2.scopedService.value);
        asserts.assertNotEquals(a1.scopedService.value, b1.scopedService.value);

        asserts.assertEquals(Doctor.discharge('SCOPE_A'), true);

        // After clearing, the next instance gets a fresh ScopedService.
        const a3 = new ServiceA();
        asserts.assertEquals(a3.scopedService.value, 'test');

        asserts.assertEquals(Doctor.discharge('NON_EXISTENT_SCOPE'), false);

        Doctor.dischargeAll();
        const b2 = new ServiceB();
        asserts.assertEquals(b2.scopedService.value, 'test');
      });
    });

    describe('Optional dependencies', () => {
      it('should silently skip optional dependencies that are not registered', () => {
        @Vial('SINGLETON')
        class RegisteredService {
          public value = 'registered';
        }

        class TestOptional {
          @Dose()
          public registeredService!: RegisteredService;
          public unregisteredService: any = undefined;

          constructor() {
            const metadata =
              Reflect.getMetadata('design:injectable', TestOptional) ?? [];
            metadata.push({
              key: 'unregisteredService',
              type: class UnregisteredService {},
              optional: true,
            });
            Reflect.defineMetadata('design:injectable', metadata, TestOptional);
            Doctor.treat(this);
          }
        }

        const instance = new TestOptional();
        asserts.assertEquals(instance.registeredService.value, 'registered');
        asserts.assertEquals(instance.unregisteredService, undefined);
      });
    });

    describe('knows()', () => {
      it('should report registered and unregistered classes correctly', () => {
        @Vial('SINGLETON')
        class IsRegistered {}
        class IsNotRegistered {}

        asserts.assertEquals(Doctor.knows(IsRegistered), true);
        asserts.assertEquals(Doctor.knows(IsNotRegistered), false);
      });
    });

    describe('Cascading injection', () => {
      it('should inoculate transient instances created during resolution', () => {
        @Vial('SINGLETON')
        class CascadeLogger {
          public log() {
            return 'log';
          }
        }
        @Vial('TRANSIENT')
        class CascadeRepo {
          @Dose()
          public logger!: CascadeLogger;
        }

        const repo = Doctor.dispense(CascadeRepo);
        asserts.assertExists(repo.logger);
        asserts.assertEquals(repo.logger.log(), 'log');
      });

      it('should inoculate scoped instances created during resolution', () => {
        @Vial('SINGLETON')
        class CascadeCfg {
          public url = 'cfg-url';
        }
        @Vial('SCOPED')
        class CascadeDb {
          @Dose()
          public cfg!: CascadeCfg;
        }

        const db = Doctor.dispense(CascadeDb, 'cascade-scope');
        asserts.assertExists(db.cfg);
        asserts.assertEquals(db.cfg.url, 'cfg-url');
      });

      it('should fill the singleton with its deps before caching it', () => {
        @Vial('SINGLETON')
        class CascadeInner {
          public name = 'inner';
        }
        @Vial('SINGLETON')
        class CascadeOuter {
          @Dose()
          public inner!: CascadeInner;
        }

        const outer = Doctor.dispense(CascadeOuter);
        asserts.assertExists(outer.inner);
        asserts.assertEquals(outer.inner.name, 'inner');
      });
    });

    describe('ScopeRequiredError', () => {
      it('should throw when a SCOPED vial is resolved with no scope', () => {
        @Vial('SCOPED')
        class ScopeNeedsScope {
          public marker = 'needs-scope';
        }

        asserts.assertThrows(
          () => Doctor.dispense(ScopeNeedsScope),
          ScopeRequiredError,
          "Vial 'ScopeNeedsScope' is SCOPED and requires a scope name",
        );
      });
    });

    describe('DuplicateVialError', () => {
      it('should throw on duplicate registration', () => {
        class DupTwice {
          public marker = 'dup';
        }
        Doctor.prescribe(DupTwice, 'SINGLETON');
        asserts.assertThrows(
          () => Doctor.prescribe(DupTwice, 'TRANSIENT'),
          DuplicateVialError,
          "Vial 'DupTwice' is already registered",
        );
      });
    });

    describe('Factory hook', () => {
      it('should call the registered factory instead of new', () => {
        class FactoryNeedsArgs {
          constructor(public readonly url: string) {}
        }
        Doctor.prescribe(FactoryNeedsArgs, {
          mode: 'SINGLETON',
          factory: () => new FactoryNeedsArgs('factory-url'),
        });

        const instance = Doctor.dispense(FactoryNeedsArgs);
        asserts.assertEquals(instance.url, 'factory-url');
      });
    });

    describe('resolve()', () => {
      it('should construct an instance with caller-supplied scope', () => {
        @Vial('SCOPED')
        class ResolveDb {
          public id = crypto.randomUUID();
        }
        @Inoculate('default-scope')
        class ResolveHandler {
          @Dose()
          public db!: ResolveDb;
        }

        const a = Doctor.resolve(ResolveHandler, 'req-A');
        const b = Doctor.resolve(ResolveHandler, 'req-B');
        const aAgain = Doctor.resolve(ResolveHandler, 'req-A');
        asserts.assertNotStrictEquals(a.db, b.db);
        asserts.assertStrictEquals(a.db, aAgain.db);
      });

      it('should honour a registered factory instead of a bare new', () => {
        class ResolveFactoryVial {
          constructor(public readonly url: string) {}
        }
        Doctor.prescribe(ResolveFactoryVial, {
          mode: 'TRANSIENT',
          factory: () => new ResolveFactoryVial('factory-made'),
        });

        // A bare `new ResolveFactoryVial()` would leave `url`
        // undefined — resolve must construct through the factory,
        // the same way dispense does.
        const instance = Doctor.resolve(ResolveFactoryVial, 'req-fac');
        asserts.assertEquals(instance.url, 'factory-made');
      });
    });

    describe('revoke()', () => {
      it('should clear the registration, singleton cache, and scopes', () => {
        @Vial('SCOPED')
        class RemoveVial {
          public n = 0;
        }
        const before = Doctor.dispense(RemoveVial, 'scope-rm');
        before.n = 5;

        asserts.assertEquals(Doctor.revoke(RemoveVial), true);
        asserts.assertEquals(Doctor.knows(RemoveVial), false);
        asserts.assertEquals(Doctor.revoke(RemoveVial), false);

        // Re-register and resolve — should be a fresh instance.
        Doctor.prescribe(RemoveVial, 'SCOPED');
        const after = Doctor.dispense(RemoveVial, 'scope-rm');
        asserts.assertEquals(after.n, 0);
      });
    });

    describe('Circular dependencies', () => {
      it('should resolve a SINGLETON <-> SINGLETON cycle without overflowing the stack', () => {
        class SingA {
          public b: SingB | undefined;
        }
        class SingB {
          public a: SingA | undefined;
        }
        Doctor.prescribe(SingA, 'SINGLETON');
        Doctor.prescribe(SingB, 'SINGLETON');
        wire(SingA, 'b', SingB);
        wire(SingB, 'a', SingA);

        // Before the fix this recursed until the stack overflowed.
        // The instance is cached before property injection, so the
        // cycle closes against the cached references.
        const a = Doctor.dispense<SingA>(SingA);
        asserts.assertExists(a.b);
        asserts.assertExists(a.b!.a);
        asserts.assertStrictEquals(a.b!.a, a);
      });

      it('should throw CircularDependencyError for a TRANSIENT <-> TRANSIENT cycle', () => {
        class TransA {
          public b: TransB | undefined;
        }
        class TransB {
          public a: TransA | undefined;
        }
        Doctor.prescribe(TransA, 'TRANSIENT');
        Doctor.prescribe(TransB, 'TRANSIENT');
        wire(TransA, 'b', TransB);
        wire(TransB, 'a', TransA);

        // A TRANSIENT instance is never cached, so the cycle can never
        // terminate — it must surface as a clear error, not a crash.
        asserts.assertThrows(
          () => Doctor.dispense(TransA),
          CircularDependencyError,
          'Circular dependency detected while resolving',
        );
      });

      it('should throw CircularDependencyError for a SINGLETON factory cycle', () => {
        class FacSingA {}
        class FacSingB {}
        // Each factory dispenses the other before its own instance
        // exists, so the cycle sits in the pre-cache window — the
        // cache cannot break it and the guard must catch it.
        Doctor.prescribe(FacSingA, {
          mode: 'SINGLETON',
          factory: () => {
            Doctor.dispense(FacSingB);
            return new FacSingA();
          },
        });
        Doctor.prescribe(FacSingB, {
          mode: 'SINGLETON',
          factory: () => {
            Doctor.dispense(FacSingA);
            return new FacSingB();
          },
        });

        asserts.assertThrows(
          () => Doctor.dispense(FacSingA),
          CircularDependencyError,
          'Circular dependency detected while resolving',
        );
      });

      it('should throw CircularDependencyError for a SCOPED factory cycle', () => {
        class FacScopA {}
        class FacScopB {}
        // Same pre-cache window as the SINGLETON case, per scope map.
        Doctor.prescribe(FacScopA, {
          mode: 'SCOPED',
          factory: () => {
            Doctor.dispense(FacScopB, 'fac-cycle-scope');
            return new FacScopA();
          },
        });
        Doctor.prescribe(FacScopB, {
          mode: 'SCOPED',
          factory: () => {
            Doctor.dispense(FacScopA, 'fac-cycle-scope');
            return new FacScopB();
          },
        });

        asserts.assertThrows(
          () => Doctor.dispense(FacScopA, 'fac-cycle-scope'),
          CircularDependencyError,
          'Circular dependency detected while resolving',
        );
      });

      it('should cache a factory result even when it is falsy', () => {
        class FalsyVial {
          public marker = 'falsy';
        }
        let calls = 0;
        Doctor.prescribe(FalsyVial, {
          mode: 'SINGLETON',
          // A factory may legitimately return a falsy value. The old
          // `cached !== undefined` sentinel missed `undefined` outright
          // and re-ran the factory on every dispense; `has()` caches it
          // so the factory runs exactly once.
          factory: () => {
            calls++;
            return undefined as unknown as FalsyVial;
          },
        });

        const first = Doctor.dispense(FalsyVial);
        const second = Doctor.dispense(FalsyVial);
        asserts.assertStrictEquals(first as unknown, undefined);
        asserts.assertStrictEquals(second as unknown, undefined);
        asserts.assertEquals(calls, 1);
      });
    });

    describe('Treat-failure eviction', () => {
      it('should retry treat() on the next dispense after a SINGLETON treat failure', () => {
        class EvictSingDep {
          public tag = 'sing-dep';
        }
        class EvictSingleton {
          public dep?: EvictSingDep;
        }
        Doctor.prescribe(EvictSingleton, 'SINGLETON');
        wire(EvictSingleton, 'dep', EvictSingDep);

        // First dispense: the dependency is unregistered, so treat()
        // throws — and the half-built instance must not stay cached.
        asserts.assertThrows(
          () => Doctor.dispense(EvictSingleton),
          UnregisteredVialError,
          'No service registered for',
        );

        // Register the missing dependency: the next dispense must
        // construct and treat a fresh instance instead of serving the
        // broken one (whose `dep` would still be undefined).
        Doctor.prescribe(EvictSingDep, 'SINGLETON');
        const healed = Doctor.dispense<EvictSingleton>(EvictSingleton);
        asserts.assertExists(healed.dep);
        asserts.assertEquals(healed.dep!.tag, 'sing-dep');
      });

      it('should retry treat() on the next dispense after a SCOPED treat failure', () => {
        class EvictScopDep {
          public tag = 'scop-dep';
        }
        class EvictScoped {
          public dep?: EvictScopDep;
        }
        Doctor.prescribe(EvictScoped, 'SCOPED');
        wire(EvictScoped, 'dep', EvictScopDep);

        asserts.assertThrows(
          () => Doctor.dispense(EvictScoped, 'evict-scope'),
          UnregisteredVialError,
          'No service registered for',
        );

        // Same scope as the failed dispense — the scope map entry
        // must have been evicted alongside the error.
        Doctor.prescribe(EvictScopDep, 'SINGLETON');
        const healed = Doctor.dispense<EvictScoped>(
          EvictScoped,
          'evict-scope',
        );
        asserts.assertExists(healed.dep);
        asserts.assertEquals(healed.dep!.tag, 'scop-dep');
      });
    });

    describe('Combining @Vial and @Inoculate', () => {
      it('should inject exactly once when dispensing a class with both decorators', () => {
        let constructions = 0;

        @Vial('TRANSIENT')
        class ComboDep {
          public tag = 'combo';
          constructor() {
            constructions++;
          }
        }

        @Vial('SINGLETON')
        @Inoculate()
        class ComboService {
          @Dose()
          public dep!: ComboDep;
        }

        const svc = Doctor.dispense(ComboService);
        asserts.assertExists(svc.dep);
        asserts.assertEquals(svc.dep.tag, 'combo');
        asserts.assert(svc instanceof ComboService);
        // dispense must stay the single injection site: the wrapper's
        // own treat running on top of dispense's would construct the
        // TRANSIENT dependency twice.
        asserts.assertEquals(constructions, 1);
        // And the SINGLETON cache holds — no re-injection either.
        asserts.assertStrictEquals(Doctor.dispense(ComboService), svc);
        asserts.assertEquals(constructions, 1);
      });

      it('should keep SINGLETON cycle tolerance for inoculated vials', () => {
        class CycWrapA {
          public b?: unknown;
        }
        class CycWrapB {
          public a?: unknown;
        }
        // Apply the decorators the way stacked `@Vial('SINGLETON')`
        // over `@Inoculate()` would (bottom-up): wrap first, then
        // register the wrapper. `design:type` on a real `@Dose` would
        // reference the exported (wrapped) binding, while the
        // injectable metadata lives on the original — mirror both.
        const WrappedA = Inoculate()(CycWrapA as any) as typeof CycWrapA;
        const WrappedB = Inoculate()(CycWrapB as any) as typeof CycWrapB;
        Doctor.prescribe(WrappedA, 'SINGLETON');
        Doctor.prescribe(WrappedB, 'SINGLETON');
        wire(CycWrapA, 'b', WrappedB);
        wire(CycWrapB, 'a', WrappedA);

        // Before the __instantiate unwrap fix, the wrapper's treat ran
        // inside the pre-cache window and this threw
        // CircularDependencyError; now the cycle closes on the cache.
        const a = Doctor.dispense<CycWrapA>(WrappedA);
        asserts.assertExists(a.b);
        asserts.assertStrictEquals((a.b as CycWrapB).a, a);
      });

      it('should resolve a reverse-order @Inoculate over @Vial vial consistently across dispense/knows/resolve', () => {
        // Reverse decorator order: decorators apply bottom-up, so
        // @Vial registers the ORIGINAL class first, then @Inoculate
        // returns the wrapper — which becomes the exported binding.
        // dispense()/knows() must unwrap to that original, matching
        // resolve() and the name-token API; before the fix they keyed
        // off the wrapper and reported the vial unregistered.
        @Inoculate()
        @Vial('SINGLETON')
        class ReverseOrder {
          public value = 'reverse';
        }

        // knows() sees through the wrapper.
        asserts.assertEquals(Doctor.knows(ReverseOrder), true);

        // dispense() resolves and caches a single SINGLETON instance.
        const first = Doctor.dispense<ReverseOrder>(ReverseOrder);
        asserts.assertExists(first);
        asserts.assertEquals(first.value, 'reverse');
        asserts.assertStrictEquals(Doctor.dispense(ReverseOrder), first);

        // The name-token path keys by the original; it must hand back
        // the very same singleton — proof the wrapper and the original
        // share one cache entry rather than double-registering.
        asserts.assertStrictEquals(
          Doctor.dispenseByName<ReverseOrder>('ReverseOrder'),
          first,
        );

        // A consumer that @Dose-injects the wrapper binding resolves
        // too — emitDecoratorMetadata records the wrapper in
        // `design:type`, so treat() must unwrap it as well.
        @Inoculate()
        class ReverseOrderConsumer {
          @Dose()
          public svc!: ReverseOrder;
        }
        const consumer = new ReverseOrderConsumer();
        asserts.assertStrictEquals(consumer.svc, first);

        // resolve() already unwrapped correctly; confirm it still
        // builds a fresh, treated instance for the same binding.
        const resolved = Doctor.resolve<ReverseOrder>(ReverseOrder);
        asserts.assertExists(resolved);
        asserts.assertEquals(resolved.value, 'reverse');
      });
    });

    describe('Optional dependency error surfacing', () => {
      it('should surface a real construction failure from a registered optional dependency', () => {
        @Vial('SCOPED')
        class OptScopedDep {
          public tag = 'opt-scoped';
        }

        class OptHost {
          public dep: OptScopedDep | undefined;
        }
        Doctor.prescribe(OptHost, 'SINGLETON');
        // Optional dependency that IS registered but SCOPED — treating
        // the host with no scope must surface ScopeRequiredError, not
        // swallow it and silently leave `dep` undefined.
        wire(OptHost, 'dep', OptScopedDep, true);

        asserts.assertThrows(
          () => Doctor.dispense(OptHost),
          ScopeRequiredError,
          "Vial 'OptScopedDep' is SCOPED and requires a scope name",
        );
      });

      it('should still skip an optional dependency whose vial is unregistered', () => {
        class OptSkipHost {
          public missing: unknown = 'untouched';
        }
        Doctor.prescribe(OptSkipHost, 'SINGLETON');
        // Unregistered optional dep — the documented contract still
        // holds: no throw, and the property is left exactly as it was.
        wire(OptSkipHost, 'missing', class UnregisteredOpt {}, true);

        const host = Doctor.dispense<OptSkipHost>(OptSkipHost);
        asserts.assertEquals(host.missing, 'untouched');
      });
    });

    describe("resolve()/dispense() on a subclass of an @Inoculate'd base", () => {
      it("resolve honours the caller scope, not the base wrapper's decoration scope", () => {
        @Vial('SCOPED')
        class SubResDb {
          public id = crypto.randomUUID();
        }
        @Inoculate()
        class SubResBase {
          @Dose()
          public db!: SubResDb;
        }
        class SubResHandler extends SubResBase {}

        // Before the fix, constructing the subclass ran the base
        // wrapper's treat mid-`super()` with scope=undefined, throwing
        // ScopeRequiredError even though a valid scope was supplied.
        const a = Doctor.resolve<SubResHandler>(SubResHandler, 'req-A');
        const b = Doctor.resolve<SubResHandler>(SubResHandler, 'req-B');
        const aAgain = Doctor.resolve<SubResHandler>(SubResHandler, 'req-A');
        asserts.assertExists(a.db);
        // Distinct scopes → distinct SCOPED instances; same scope → shared.
        asserts.assertNotStrictEquals(a.db, b.db);
        asserts.assertStrictEquals(a.db, aAgain.db);
      });

      it('dispense injects a subclass exactly once (no double injection)', () => {
        let constructions = 0;
        @Vial('TRANSIENT')
        class SubDispDep {
          public tag = 'sub-disp';
          constructor() {
            constructions++;
          }
        }
        @Inoculate()
        class SubDispBase {
          @Dose()
          public dep!: SubDispDep;
        }
        class SubDispSvc extends SubDispBase {}
        Doctor.prescribe(SubDispSvc, 'SINGLETON');

        const svc = Doctor.dispense<SubDispSvc>(SubDispSvc);
        asserts.assertExists(svc.dep);
        asserts.assertEquals(svc.dep.tag, 'sub-disp');
        // Before the fix the base wrapper treated during `super()` and
        // then dispense treated again — the TRANSIENT dep was built twice.
        asserts.assertEquals(constructions, 1);
      });
    });

    describe('auto-treat during an in-flight operation', () => {
      it("injects an @Inoculate'd collaborator built with plain `new` inside a factory", () => {
        // Round-5 C2: the wrapper's auto-treat suppression must fire only
        // for the exact instance Doctor is constructing (a plain subclass
        // via Reflect.construct), NOT for any `new` that happens while some
        // operation is in flight. A `@Vial` factory building a collaborator
        // with plain `new` during dispense must still auto-treat it — a
        // global "an operation is in flight" flag over-suppressed it.
        @Vial('SINGLETON')
        class InFlightLog {
          public id = 'in-flight-log';
        }
        @Inoculate()
        class InFlightHelper {
          @Dose()
          public log!: InFlightLog;
        }
        @Vial({
          mode: 'SINGLETON',
          factory: () => ({ helper: new InFlightHelper() }),
        })
        class InFlightService {}

        // The same `new InFlightHelper()` injects whether it runs outside
        // or inside a Doctor operation.
        asserts.assertEquals(new InFlightHelper().log.id, 'in-flight-log');
        const svc = Doctor.dispense(InFlightService) as {
          helper: InFlightHelper;
        };
        asserts.assertEquals(svc.helper.log.id, 'in-flight-log');
      });

      it('still suppresses the double-treat when Doctor itself constructs a plain subclass', () => {
        // Complement: narrowing the suppression from a global flag to an
        // identity match must NOT lose the double-treat guard. When Doctor
        // builds a plain subclass via Reflect.construct, the base wrapper
        // reached as its super() must still stay dormant, leaving dispense
        // as the single injection site.
        let built = 0;
        @Vial('TRANSIENT')
        class NarrowDep {
          constructor() {
            built++;
          }
        }
        @Inoculate()
        class NarrowBase {
          @Dose()
          public dep!: NarrowDep;
        }
        class NarrowSvc extends NarrowBase {}
        Doctor.prescribe(NarrowSvc, 'SINGLETON');

        const svc = Doctor.dispense<NarrowSvc>(NarrowSvc);
        asserts.assertExists(svc.dep);
        asserts.assertEquals(built, 1);
      });

      it("treats a factory's returned @Inoculate'd instance exactly once (TRANSIENT dep built once)", () => {
        // Round-6: a @Vial factory that RETURNS a directly-@Inoculate'd
        // instance must not double-treat it. The wrapper auto-treats the
        // instance as the factory constructs it (`new R6Db()`); the driving
        // dispense must then NOT treat the very same returned instance
        // again, or its TRANSIENT @Dose dep is built twice — the first
        // result silently orphaned. Round-5 lost round-4's single-treat
        // guarantee here: the factory runs outside the identity marker, so
        // the auto-treat fired AND dispense treated once more (depBuilt=2).
        let depBuilt = 0;
        @Vial('TRANSIENT')
        class R6Cfg {
          public v = 'cfg';
          constructor() {
            depBuilt++;
          }
        }
        @Inoculate()
        class R6Db {
          @Dose()
          public cfg!: R6Cfg;
        }
        @Vial({ mode: 'SINGLETON', factory: () => new R6Db() })
        class R6DbProvider {}

        const db = Doctor.dispense(R6DbProvider) as R6Db;
        asserts.assertEquals(db.cfg.v, 'cfg');
        // Exactly one treat → the TRANSIENT dep is built exactly once.
        asserts.assertEquals(depBuilt, 1);
      });

      it("resolves a factory's returned @Inoculate'd instance with a SCOPED dep under the operation scope (no throw, no double-treat)", () => {
        // Round-6 (loud): the returned class carries NO decoration scope and
        // its @Dose dep is SCOPED, so the single treat must run under the
        // operation's scope (the one dispense was called with). On round-5
        // the factory-time auto-treat ran with the class's absent decoration
        // scope and threw ScopeRequiredError before dispense could treat it
        // with the caller's scope.
        let depBuilt = 0;
        @Vial('SCOPED')
        class R6SCfg {
          public v = 's';
          constructor() {
            depBuilt++;
          }
        }
        @Inoculate()
        class R6SDb {
          @Dose()
          public cfg!: R6SCfg;
        }
        @Vial({ mode: 'SINGLETON', factory: () => new R6SDb() })
        class R6SDbProvider {}

        const db = Doctor.dispense(R6SDbProvider, 'r6-req') as R6SDb;
        asserts.assertEquals(db.cfg.v, 's');
        asserts.assertEquals(depBuilt, 1);
        Doctor.discharge('r6-req');
      });

      it("resolve() treats a factory's returned @Inoculate'd instance with a SCOPED dep exactly once under the caller's scope", () => {
        // Same shape via resolve() + a TRANSIENT-registered factory: the
        // factory-return path must be a single treat under the caller's
        // scope regardless of which resolution entry point drives it.
        let depBuilt = 0;
        @Vial('SCOPED')
        class R6RCfg {
          public v = 'r';
          constructor() {
            depBuilt++;
          }
        }
        @Inoculate()
        class R6RDb {
          @Dose()
          public cfg!: R6RCfg;
        }
        @Vial({ mode: 'TRANSIENT', factory: () => new R6RDb() })
        class R6RProvider {}

        const db = Doctor.resolve(R6RProvider, 'r6-rscope') as R6RDb;
        asserts.assertEquals(db.cfg.v, 'r');
        asserts.assertEquals(depBuilt, 1);
        Doctor.discharge('r6-rscope');
      });

      it("still auto-treats an @Inoculate'd instance a factory builds under its own decoration scope", () => {
        // The operation scope only FILLS IN when the factory-built class
        // carries no decoration scope of its own — an explicit
        // `@Inoculate('fixed')` still wins, so a collaborator with a
        // deliberate scope is not silently re-scoped to the operation's.
        @Vial('SCOPED')
        class R6FixedDep {
          public v = 'fixed';
        }
        @Inoculate('r6-fixed')
        class R6Fixed {
          @Dose()
          public dep!: R6FixedDep;
        }
        @Vial({ mode: 'SINGLETON', factory: () => new R6Fixed() })
        class R6FixedProvider {}

        // Dispensed under a DIFFERENT operation scope; the SCOPED dep must
        // land under the decoration-time 'r6-fixed' via a single treat.
        // Round-5 treated twice, so the dep was ALSO resolved under the
        // operation scope 'r6-other' — assert that map is never created.
        const inst = Doctor.dispense(R6FixedProvider, 'r6-other') as R6Fixed;
        asserts.assertEquals(inst.dep.v, 'fixed');
        asserts.assert((Doctor as any).__scopes.has('r6-fixed'));
        asserts.assert(!(Doctor as any).__scopes.has('r6-other'));
        Doctor.discharge('r6-fixed');
      });

      it('does NOT bind a non-returned SCOPED-dep collaborator into a singleton under the operation scope', () => {
        // Round-7 (regression from the round-6 fix): the operation-scope
        // fallback must apply to the factory's RETURN VALUE only. A
        // collaborator the factory builds with `new` but does NOT return,
        // whose @Dose is SCOPED and which carries no decoration scope, must
        // fail exactly as it did pre-round-6 — ScopeRequiredError — instead of
        // silently inheriting the operation scope (which would smuggle a
        // request-scoped instance into this SINGLETON). Round-6 threaded the
        // fallback to every auto-treat during the factory, so this dispense
        // resolved the collaborator's SCOPED dep under 'r7-op' and returned a
        // singleton wired to a request-scoped instance — no throw.
        @Vial('SCOPED')
        class R7Cfg {
          public v = 'collab';
        }
        @Inoculate() // no decoration scope
        class R7Collab {
          @Dose()
          public cfg!: R7Cfg;
        }
        @Inoculate()
        class R7Ret {
          public v = 'ret';
        }
        let builtCollab: R7Collab | undefined;
        @Vial({
          mode: 'SINGLETON',
          factory: () => {
            // A SCOPED-dep collaborator with no scope of its own, NOT returned.
            builtCollab = new R7Collab();
            return new R7Ret();
          },
        })
        class R7Provider {}

        asserts.assertThrows(
          () => Doctor.dispense(R7Provider, 'r7-op'),
          ScopeRequiredError,
        );
        // The collaborator was constructed but its SCOPED @Dose was never
        // resolved — it did not inherit the operation scope.
        asserts.assertExists(builtCollab);
        asserts.assertEquals(builtCollab!.cfg, undefined);
        // No operation-scope map holds the collaborator's request-scoped dep.
        asserts.assert(!(Doctor as any).__scopes.has('r7-op'));
      });

      it('resolves a non-returned collaborator under its OWN scope while the returned instance gets the operation-scope fallback (single treat)', () => {
        // The complement: a non-returned collaborator carrying its own
        // decoration scope resolves under THAT scope (never the operation's),
        // and the factory's RETURN VALUE — an @Inoculate() with a SCOPED dep
        // and no decoration scope — still gets the operation-scope fallback,
        // treated exactly once.
        let retDepBuilt = 0;
        @Vial('SCOPED')
        class R7OwnCfg {
          public v = 'own';
        }
        @Inoculate('r7-own') // collaborator's own decoration scope wins
        class R7OwnCollab {
          @Dose()
          public cfg!: R7OwnCfg;
        }
        @Vial('SCOPED')
        class R7RetCfg {
          public v = 'ret';
          constructor() {
            retDepBuilt++;
          }
        }
        @Inoculate() // returned: no decoration scope → operation-scope fallback
        class R7RetSvc {
          @Dose()
          public cfg!: R7RetCfg;
        }
        let builtCollab: R7OwnCollab | undefined;
        @Vial({
          mode: 'SINGLETON',
          factory: () => {
            builtCollab = new R7OwnCollab(); // NOT returned
            return new R7RetSvc();
          },
        })
        class R7MixedProvider {}

        const svc = Doctor.dispense(R7MixedProvider, 'r7-mixed') as R7RetSvc;
        // The returned instance got the operation-scope fallback, treated once.
        asserts.assertEquals(svc.cfg.v, 'ret');
        asserts.assertEquals(retDepBuilt, 1);
        // The collaborator resolved under its OWN 'r7-own' scope...
        asserts.assertExists(builtCollab);
        asserts.assertEquals(builtCollab!.cfg.v, 'own');
        asserts.assert((Doctor as any).__scopes.has('r7-own'));
        // ...and the operation scope holds the RETURNED instance's dep, not
        // the collaborator's — the collaborator never inherited it.
        asserts.assert((Doctor as any).__scopes.has('r7-mixed'));
        const opMap = (Doctor as any).__scopes.get('r7-mixed');
        asserts.assert(opMap.has(R7RetCfg));
        asserts.assert(!opMap.has(R7OwnCfg));
        Doctor.discharge('r7-own');
        Doctor.discharge('r7-mixed');
      });
    });

    describe('revoke() on a reverse-order @Inoculate over @Vial vial', () => {
      it('revokes a vial whose exported binding is the @Inoculate wrapper', () => {
        // @Vial applies first (bottom-up), registering the ORIGINAL;
        // @Inoculate then exports the wrapper. revoke must normalise to
        // the registered original, the same way dispense()/knows() do.
        @Inoculate()
        @Vial('SINGLETON')
        class RevWrapped {
          public value = 'wrapped';
        }
        const first = Doctor.dispense<RevWrapped>(RevWrapped);
        asserts.assertEquals(first.value, 'wrapped');

        // Before the fix revoke keyed off the wrapper, missed every map,
        // returned false, and left knows()=true with the cached singleton.
        asserts.assertEquals(Doctor.revoke(RevWrapped), true);
        asserts.assertEquals(Doctor.knows(RevWrapped), false);

        // Re-register + dispense: a fresh instance proves the cached
        // singleton was dropped along with the registration.
        Doctor.prescribe(RevWrapped, 'SINGLETON');
        const second = Doctor.dispense<RevWrapped>(RevWrapped);
        asserts.assertNotStrictEquals(second, first);
      });
    });

    describe('SCOPED failure does not leak scope maps', () => {
      it('prunes the per-scope map when the factory throws', () => {
        @Vial({
          mode: 'SCOPED',
          factory: () => {
            throw new Error('scoped-boom');
          },
        })
        class LeakFactoryDb {}

        const before = (Doctor as any).__scopes.size;
        for (const id of ['leak-f-0', 'leak-f-1', 'leak-f-2']) {
          asserts.assertThrows(
            () => Doctor.dispense(LeakFactoryDb, id),
            Error,
            'scoped-boom',
          );
        }
        // Before the fix each failed dispense left an empty Map behind,
        // so this grew by one per iteration under a persistent outage.
        asserts.assertEquals((Doctor as any).__scopes.size, before);
      });

      it('prunes the per-scope map when treat() throws', () => {
        @Vial('SCOPED')
        class LeakTreatHost {
          public dep?: unknown;
        }
        // A required dependency that is never registered makes treat()
        // throw after the (empty) scope map is already in place.
        wire(LeakTreatHost, 'dep', class LeakMissingDep {});

        const before = (Doctor as any).__scopes.size;
        for (const id of ['leak-t-0', 'leak-t-1']) {
          asserts.assertThrows(
            () => Doctor.dispense(LeakTreatHost, id),
            UnregisteredVialError,
            'No service registered for',
          );
        }
        asserts.assertEquals((Doctor as any).__scopes.size, before);
      });

      it('drops the whole scope when a later SCOPED dep fails after a healthy SCOPED sibling', () => {
        // The realistic per-request pattern: a healthy SCOPED dependency
        // (a request-context logger) resolves first and populates the
        // scope map, then a second SCOPED dependency (a DB that is down)
        // fails. Because the map is non-empty when the failing dispense
        // unwinds, the old `size === 0` prune never fired — the scope
        // leaked one *live* instance per failed request under unique
        // per-request scope names. Assert the count returns to baseline.
        @Vial('SCOPED')
        class LeakGoodDep {
          public value = 'good';
        }
        @Vial({
          mode: 'SCOPED',
          factory: () => {
            throw new Error('sibling-boom');
          },
        })
        class LeakBadDep {}

        // Healthy sibling declared FIRST so it resolves before the failing
        // one — the order that exposes the leak.
        class LeakMultiHandler {
          @Dose()
          public good!: LeakGoodDep;
          @Dose()
          public bad!: LeakBadDep;
        }

        const before = (Doctor as any).__scopes.size;
        for (const id of ['multi-0', 'multi-1', 'multi-2', 'multi-3']) {
          asserts.assertThrows(
            () => Doctor.resolve(LeakMultiHandler, id),
            Error,
            'sibling-boom',
          );
        }
        asserts.assertEquals((Doctor as any).__scopes.size, before);

        // Declaration order must not matter — flip the two @Dose fields
        // and the scope map is still fully rolled back.
        class LeakMultiHandlerFlipped {
          @Dose()
          public bad!: LeakBadDep;
          @Dose()
          public good!: LeakGoodDep;
        }
        for (const id of ['multi-f-0', 'multi-f-1']) {
          asserts.assertThrows(
            () => Doctor.resolve(LeakMultiHandlerFlipped, id),
            Error,
            'sibling-boom',
          );
        }
        asserts.assertEquals((Doctor as any).__scopes.size, before);
      });

      it('drops a nested dispense into a DIFFERENT scope that fails, keeping pre-existing scopes', () => {
        // Round-5 C3: a nested dispense/resolve into a different scope runs
        // while an outer operation is in flight. If it creates a fresh
        // scope map and then throws, that map must still be rolled back —
        // by the frame that created it — even though it is not the
        // outermost. Under unique per-request nested scope names the old
        // outermost-only rollback leaked one empty map per failed request.
        @Vial({
          mode: 'SCOPED',
          factory: () => {
            throw new Error('inner-down');
          },
        })
        class NestedInnerBad {}
        let n = 0;
        @Vial({
          mode: 'SINGLETON',
          factory: () => Doctor.dispense(NestedInnerBad, `nested-inner-${++n}`),
        })
        class NestedOuter {}
        // A pre-existing, healthy scope that must survive the failures.
        @Vial('SCOPED')
        class NestedKeep {
          public value = 'keep';
        }

        Doctor.dispense(NestedKeep, 'nested-pre');
        const before = (Doctor as any).__scopes.size;
        asserts.assert((Doctor as any).__scopes.has('nested-pre'));

        for (const id of ['n-0', 'n-1', 'n-2', 'n-3', 'n-4']) {
          asserts.assertThrows(
            () => Doctor.resolve(NestedOuter, id),
            Error,
            'inner-down',
          );
        }
        // No `nested-inner-*` map leaked, and the pre-existing scope is
        // untouched.
        asserts.assertEquals((Doctor as any).__scopes.size, before);
        asserts.assert((Doctor as any).__scopes.has('nested-pre'));
        Doctor.discharge('nested-pre');
      });

      it('keeps a pre-existing scope when a later dispense into it fails', () => {
        // Rollback only removes a scope the failed operation created. A
        // scope populated by an earlier successful resolution must
        // survive a later failing dispense under the same name.
        @Vial('SCOPED')
        class KeepGoodDep {
          public value = 'keep';
        }
        @Vial({
          mode: 'SCOPED',
          factory: () => {
            throw new Error('keep-boom');
          },
        })
        class KeepBadDep {}

        Doctor.dispense(KeepGoodDep, 'shared-scope');
        const withShared = (Doctor as any).__scopes.size;
        asserts.assert((Doctor as any).__scopes.has('shared-scope'));

        asserts.assertThrows(
          () => Doctor.dispense(KeepBadDep, 'shared-scope'),
          Error,
          'keep-boom',
        );
        // The pre-existing scope is untouched.
        asserts.assertEquals((Doctor as any).__scopes.size, withShared);
        asserts.assert((Doctor as any).__scopes.has('shared-scope'));
        Doctor.discharge('shared-scope');
      });
    });
  },
});
