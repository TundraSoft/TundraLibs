/**
 * @fileoverview Tests for the @Inoculate decorator.
 * @module
 */

// deno-lint-ignore-file no-explicit-any
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Doctor, Dose, Inoculate, ScopeRequiredError, Vial } from '../mod.ts';

describe({
  name: '@Inoculate',
  // @Inoculate wraps classes whose @Dose props need `design:type` from
  // reflect-metadata (emitDecoratorMetadata). tsx/esbuild can't emit it, so
  // this runs on Deno and Bun only.
  node: false,
  fn: () => {
    describe('Auto-injection', () => {
      it('should inject @Dose properties on construction', () => {
        @Vial('SINGLETON')
        class IT_Dep {
          public value = 'auto injected';
        }

        @Inoculate()
        class IT_Owner {
          @Dose()
          public dep!: IT_Dep;
        }

        asserts.assertEquals(new IT_Owner().dep.value, 'auto injected');
      });
    });

    describe('Constructor forwarding', () => {
      it('should forward constructor arguments to the original class', () => {
        @Vial('SINGLETON')
        class IT_Dep2 {
          public value = 'injected';
        }

        @Inoculate()
        class IT_Forwarded {
          @Dose()
          public dep!: IT_Dep2;
          public passedValue: string;
          constructor(value: string) {
            this.passedValue = value;
          }
        }

        const instance = new IT_Forwarded('test value');
        asserts.assertEquals(instance.passedValue, 'test value');
        asserts.assertEquals(instance.dep.value, 'injected');
      });
    });

    describe('Prototype chain', () => {
      it('should preserve instanceof and own methods', () => {
        @Vial('SINGLETON')
        class IT_DepP {}

        @Inoculate()
        class IT_Proto {
          @Dose()
          public dep!: IT_DepP;
          public ownMethod() {
            return 'own';
          }
        }

        const instance = new IT_Proto();
        asserts.assert(instance instanceof IT_Proto);
        asserts.assertEquals(instance.ownMethod(), 'own');
        asserts.assertEquals(instance.constructor.name, 'IT_Proto');
      });
    });

    describe('Subclassing', () => {
      it("should inject a subclass's own @Dose exactly once when the subclass is @Inoculate'd", () => {
        let baseDepConstructions = 0;
        @Vial('TRANSIENT')
        class IT_SubBaseDep {
          public value = 'base-dep';
          constructor() {
            baseDepConstructions++;
          }
        }
        @Vial('SINGLETON')
        class IT_SubOwnDep {
          public value = 'sub-dep';
        }

        @Inoculate()
        class IT_SubBase {
          @Dose()
          public baseDep!: IT_SubBaseDep;
          public baseMethod() {
            return 'base';
          }
        }
        @Inoculate()
        class IT_Sub extends IT_SubBase {
          @Dose()
          public subDep!: IT_SubOwnDep;
          public extra = 'from-sub';
          public subMethod() {
            return 'sub';
          }
        }

        const s = new IT_Sub();
        // Prototype chain / own members (the `new.target` forwarding).
        asserts.assert(s instanceof IT_Sub);
        asserts.assert(s instanceof IT_SubBase);
        asserts.assertEquals(s.subMethod(), 'sub');
        asserts.assertEquals(s.baseMethod(), 'base');
        asserts.assertEquals(s.extra, 'from-sub');
        // Base @Dose injected.
        asserts.assertEquals(s.baseDep.value, 'base-dep');
        // Subclass @Dose injected — before the fix the base wrapper's
        // treat fired during `super()` and the subclass field
        // initializer immediately re-defined `subDep` back to undefined.
        asserts.assertEquals(s.subDep.value, 'sub-dep');
        // Exactly one treat runs (the subclass wrapper, at the end of
        // construction) — before the fix both the base and subclass
        // wrappers treated, building the TRANSIENT base dep twice.
        asserts.assertEquals(baseDepConstructions, 1);
      });

      it("should not auto-inject a non-@Inoculate'd subclass (no silent partial); resolve does", () => {
        @Vial('SINGLETON')
        class IT_PlainBaseDep {
          public value = 'plain-base';
        }
        @Vial('SINGLETON')
        class IT_PlainSubDep {
          public value = 'plain-sub';
        }

        @Inoculate()
        class IT_PlainBase {
          @Dose()
          public baseDep!: IT_PlainBaseDep;
        }
        class IT_PlainSub extends IT_PlainBase {
          @Dose()
          public subDep!: IT_PlainSubDep;
        }

        // `new` on a non-inoculated subclass no longer auto-treats:
        // before the fix the base wrapper injected `baseDep` but the
        // subclass field initializer wiped `subDep`, yielding a
        // silently half-built instance. Now it is all-or-nothing —
        // neither is injected — so a missing `@Inoculate` is obvious.
        const bare = new IT_PlainSub();
        asserts.assertStrictEquals(bare.baseDep, undefined);
        asserts.assertStrictEquals(bare.subDep, undefined);

        // The supported path — resolve/dispense treat after
        // construction completes — injects both base and subclass deps.
        const resolved = Doctor.resolve<IT_PlainSub>(IT_PlainSub);
        asserts.assertEquals(resolved.baseDep.value, 'plain-base');
        asserts.assertEquals(resolved.subDep.value, 'plain-sub');
      });

      it("multi-level: an intermediate class's @Dose is all-or-nothing on `new`, and resolve injects every level", () => {
        // Round-5 C1: the base wrapper runs as `super()` and fires before
        // an INTERMEDIATE class's field initializers. Auto-treating there
        // would fill the intermediate `@Dose` and then have its own
        // initializer immediately wipe it — the exact silent half-injection
        // prior rounds removed for the two-level case, now guarded at any
        // depth. A plain leaf below an intermediate `@Dose` must be
        // all-or-nothing on `new`: neither the base's nor the
        // intermediate's dependency is set.
        @Vial('SINGLETON')
        class IT_MLDepA {
          public value = 'ml-a';
        }
        @Vial('SINGLETON')
        class IT_MLDepB {
          public value = 'ml-b';
        }

        @Inoculate()
        class IT_MLBase {
          @Dose()
          public a!: IT_MLDepA;
        }
        // Own @Dose, but NO @Inoculate — the misuse C1 must not half-inject.
        class IT_MLMid extends IT_MLBase {
          @Dose()
          public b!: IT_MLDepB;
        }
        class IT_MLLeaf extends IT_MLMid {} // plain leaf

        const bare = new IT_MLLeaf() as any;
        asserts.assertStrictEquals(bare.a, undefined);
        asserts.assertStrictEquals(bare.b, undefined);

        // The supported path treats after construction completes, so every
        // level — base AND intermediate — is injected.
        const resolved = Doctor.resolve<IT_MLLeaf>(IT_MLLeaf) as any;
        asserts.assertEquals(resolved.a.value, 'ml-a');
        asserts.assertEquals(resolved.b.value, 'ml-b');
      });

      it('should inject a 3-level @Inoculate chain with @Dose at each level exactly once', () => {
        // A well-formed multi-level chain: every level carries its own
        // @Inoculate. Only the most-derived wrapper treats — once, after
        // every field (all three levels) has initialized — so each level's
        // @Dose is injected and each TRANSIENT dep is built exactly once.
        let aBuilt = 0, bBuilt = 0, cBuilt = 0;
        @Vial('TRANSIENT')
        class IT_L3A {
          public value = 'l3-a';
          constructor() {
            aBuilt++;
          }
        }
        @Vial('TRANSIENT')
        class IT_L3B {
          public value = 'l3-b';
          constructor() {
            bBuilt++;
          }
        }
        @Vial('TRANSIENT')
        class IT_L3C {
          public value = 'l3-c';
          constructor() {
            cBuilt++;
          }
        }

        @Inoculate()
        class IT_L3Base {
          @Dose()
          public a!: IT_L3A;
        }
        @Inoculate()
        class IT_L3Mid extends IT_L3Base {
          @Dose()
          public b!: IT_L3B;
        }
        @Inoculate()
        class IT_L3Leaf extends IT_L3Mid {
          @Dose()
          public c!: IT_L3C;
        }

        const l = new IT_L3Leaf();
        asserts.assertEquals(l.a.value, 'l3-a');
        asserts.assertEquals(l.b.value, 'l3-b');
        asserts.assertEquals(l.c.value, 'l3-c');
        // Base and intermediate wrappers stay dormant; only Leaf's treats.
        asserts.assertEquals([aBuilt, bBuilt, cBuilt], [1, 1, 1]);
      });

      it("should inject an @Inoculate'd base's @Dose onto a plain subclass that declares no @Dose of its own", () => {
        // Round-4 regression guard: a subclass with no @Dose (and no
        // @Inoculate) of its own must still get the base's @Dose — those
        // fields are set inside super() and no subclass field
        // initializer overwrites them. Before this fix `new BareSub()`
        // left `dep` undefined; this was previously-released behaviour.
        @Vial('SINGLETON')
        class IT_BaseOnlyDep {
          public value = 'base-only';
        }

        @Inoculate()
        class IT_BaseOnly {
          @Dose()
          public dep!: IT_BaseOnlyDep;
          public baseMethod() {
            return 'base';
          }
        }
        class IT_BareSub extends IT_BaseOnly {
          public extra = 'sub-field';
        }

        const s = new IT_BareSub();
        asserts.assert(s instanceof IT_BareSub);
        asserts.assert(s instanceof IT_BaseOnly);
        // The base @Dose is injected, and the subclass's own plain field
        // still initializes to its literal.
        asserts.assertEquals(s.dep.value, 'base-only');
        asserts.assertEquals(s.extra, 'sub-field');
        asserts.assertEquals(s.baseMethod(), 'base');
      });

      it("should inherit an @Inoculate'd base's decoration-time scope on a plain subclass", () => {
        // A plain subclass of a scoped base injects the base's SCOPED
        // @Dose under the base's decoration-time scope — no
        // ScopeRequiredError and no need to repeat the scope.
        @Vial('SCOPED')
        class IT_InhScopedDep {
          public value = 'scoped-inherited';
        }

        @Inoculate('inh-scope')
        class IT_ScopedBase {
          @Dose()
          public dep!: IT_InhScopedDep;
        }
        class IT_ScopedBareSub extends IT_ScopedBase {}

        const a = new IT_ScopedBareSub();
        asserts.assertEquals(a.dep.value, 'scoped-inherited');
        // Same scope name → same SCOPED instance across constructions.
        const b = new IT_ScopedBareSub();
        a.dep.value = 'mutated';
        asserts.assertEquals(b.dep.value, 'mutated');
        Doctor.dischargeAll();
      });

      it("should treat a subclass's own @Inoculate with the subclass's scope, not the base's", () => {
        // Documents the finding-3 gotcha: a subclass wrapper captures its
        // OWN scope argument. A bare @Inoculate() over a scoped base
        // treats with no scope, so a SCOPED base dep throws; repeating
        // the scope argument on the subclass is what threads it.
        @Vial('SCOPED')
        class IT_RepScopedDep {
          public value = 'rep';
        }
        @Inoculate('rep-scope')
        class IT_RepBase {
          @Dose()
          public dep!: IT_RepScopedDep;
        }

        @Inoculate()
        class IT_RepSubBare extends IT_RepBase {}
        asserts.assertThrows(() => new IT_RepSubBare(), ScopeRequiredError);

        @Inoculate('rep-scope')
        class IT_RepSubScoped extends IT_RepBase {}
        asserts.assertEquals(new IT_RepSubScoped().dep.value, 'rep');
        Doctor.dischargeAll();
      });

      it('should treat a plain subclass exactly once via resolve (no double injection, no stray scope)', () => {
        // The base wrapper must stay dormant while Doctor is building the
        // subclass — otherwise resolve() would treat once under the
        // base's decoration-time scope (creating a stray scope, or
        // throwing for a SCOPED dep) and again under the caller's scope.
        @Vial('SCOPED')
        class IT_ResScopedDep {
          public value = 'res';
        }
        @Inoculate('base-scope')
        class IT_ResBase {
          @Dose()
          public dep!: IT_ResScopedDep;
        }
        class IT_ResSub extends IT_ResBase {}

        Doctor.dischargeAll();
        const r = Doctor.resolve<IT_ResSub>(IT_ResSub, 'req-x');
        asserts.assertEquals(r.dep.value, 'res');
        // Only the caller's scope was ever created — the base's
        // 'base-scope' was never touched (no double treat).
        asserts.assert(!(Doctor as any).__scopes.has('base-scope'));
        asserts.assert((Doctor as any).__scopes.has('req-x'));
        Doctor.dischargeAll();
      });

      it('should leave direct construction of the decorated class unchanged', () => {
        @Vial('SINGLETON')
        class IT_DepDirect {
          public value = 'direct-injected';
        }

        @Inoculate()
        class IT_Direct {
          @Dose()
          public dep!: IT_DepDirect;
        }

        const d = new IT_Direct();
        asserts.assert(d instanceof IT_Direct);
        asserts.assertEquals(d.constructor.name, 'IT_Direct');
        asserts.assertEquals(d.dep.value, 'direct-injected');
      });
    });

    describe('Static members', () => {
      it('should preserve static properties and methods', () => {
        @Vial('SINGLETON')
        class IT_DepS {}

        @Inoculate()
        class IT_Statics {
          @Dose()
          public dep!: IT_DepS;
          static prop = 'static property';
          static method() {
            return 'static method';
          }
        }

        asserts.assertEquals(IT_Statics.prop, 'static property');
        asserts.assertEquals(IT_Statics.method(), 'static method');
      });
    });

    describe('Scope handling', () => {
      it('should respect the scope captured at decoration time', () => {
        @Vial('SCOPED')
        class IT_Scoped {
          public value = 'original';
        }

        @Inoculate('SCOPE1')
        class IT_S1A {
          @Dose()
          public dep!: IT_Scoped;
        }
        @Inoculate('SCOPE2')
        class IT_S2 {
          @Dose()
          public dep!: IT_Scoped;
        }
        @Inoculate('SCOPE1')
        class IT_S1B {
          @Dose()
          public dep!: IT_Scoped;
        }

        const a = new IT_S1A();
        const b = new IT_S2();
        const sameScope = new IT_S1B();

        a.dep.value = 'modified';
        asserts.assertEquals(sameScope.dep.value, 'modified');
        asserts.assertEquals(b.dep.value, 'original');
      });
    });
  },
});
