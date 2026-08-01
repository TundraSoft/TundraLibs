/**
 * @fileoverview `@Inoculate(scope?)` — class decorator that wraps
 * the constructor so every `new` call automatically calls
 * `Doctor.treat(instance, scope)` on the fresh instance.
 *
 * @module
 */

// deno-lint-ignore-file no-explicit-any
import { Doctor } from '../Doctor.ts';

/**
 * Decide whether the wrapper `f` (wrapping `original`) should auto-treat
 * the instance it just built during `super()`, given the `new.target` of
 * the construction.
 *
 * This wrapper runs as `super()` for the whole chain of subclasses above
 * `original`, so it fires *before* any subclass field initializer. Class
 * fields use define semantics: a field declared on a class **more derived
 * than `original`** re-defines itself (to `undefined` for a bare `@Dose`)
 * *after* this wrapper returns. Treating here would therefore fill such a
 * field and have its initializer immediately wipe it — a silent
 * half-injection. So the invariant is **all-or-nothing**: auto-treat only
 * when nothing more-derived than `original` can either need injecting
 * (its own `@Dose`) or owns injecting itself (its own `@Inoculate`).
 *
 * - `new`-less call (`target === undefined`) or a direct `new Wrapped()`
 *   (`target === f`): this wrapper *is* the most-derived constructor, so
 *   every field has initialized — treat.
 * - Otherwise walk the static prototype chain from `target` down to this
 *   wrapper `f` (exclusive). If **any** class between the leaf and `f`
 *   either carries its own `@Inoculate` (own `__doctorOriginal` — that
 *   wrapper is a more-derived constructor and treats after its own fields
 *   initialize) or declares its own `@Dose` (own `design:injectable` —
 *   whose initializer runs after `super()` and would wipe what we fill),
 *   stay dormant. This holds at ANY inheritance depth, so an intermediate
 *   class's `@Dose` can never be silently wiped on a plain leaf.
 * - A plain subclass that adds nothing of its own between it and `f`
 *   inherits the base's `@Dose` (set inside `super()`, never overwritten)
 *   and its decoration-time scope — treat.
 */
function shouldAutoTreat(f: any, original: any, target: any): boolean {
  if (target === undefined || target === f) return true;
  for (
    let c = target;
    c && c !== f && c !== original;
    c = Object.getPrototypeOf(c)
  ) {
    // A more-derived class carrying its own @Inoculate owns its
    // injection; its wrapper treats after every field has initialized.
    if (Object.hasOwn(c, '__doctorOriginal')) return false;
    // A more-derived class's own @Dose initializes *after* super(), so
    // treating here would fill it then have the initializer wipe it.
    // `getOwnMetadata` ignores inherited base entries, so this is
    // `undefined` for a class that only inherits `@Dose` from `original`.
    if (Reflect.getOwnMetadata('design:injectable', c) !== undefined) {
      return false;
    }
  }
  return true;
}

/**
 * Wrap the decorated class's constructor so {@link Doctor.treat}
 * fires automatically on every `new`. The `scope` argument is
 * captured at decoration time and reused for every instance.
 *
 * The wrapper auto-treats in exactly these cases, and stays dormant
 * otherwise so it never produces a silently half-injected instance:
 *
 * - **Direct `new Wrapped()`** (or a `new`-less call): treated with the
 *   decoration-time `scope`.
 * - **A plain subclass that adds nothing of its own between it and the
 *   wrapped base** — `class Sub extends Wrapped {}`, at any depth
 *   (`class Leaf extends Mid extends Wrapped {}` where every level down
 *   to the base is plain): the base's own `@Dose` fields are set inside
 *   `super()` and no later field initializer overwrites them, so the
 *   base wrapper treats the instance with the base's decoration-time
 *   `scope`. Such a subclass therefore inherits the base's scope
 *   automatically.
 *
 * It stays **dormant** when:
 *
 * - **Doctor is constructing this exact instance** ({@link Doctor.resolve}
 *   / {@link Doctor.dispense} call `Reflect.construct(t)` and this wrapper
 *   runs as its `super()`): the driving call treats once, afterwards, with
 *   the caller's scope — treating here too would inject twice. This is
 *   keyed to the identity of the class under construction
 *   ({@link Doctor.constructing}), so an unrelated `new` during another
 *   in-flight operation — e.g. a `@Vial` factory building a collaborator
 *   with plain `new` — is **not** suppressed and still auto-treats.
 * - **Any class more-derived than the base carries its own `@Inoculate`**:
 *   that wrapper is a more-derived constructor and treats once, after
 *   every field (base and subclass) has initialized. Note its wrapper
 *   treats with the subclass's **own** `scope`, not the base's — so a
 *   scoped base (`@Inoculate('job')`) subclassed as `@Inoculate()` treats
 *   with no scope; repeat the scope argument (`@Inoculate('job')`) on the
 *   subclass, or use {@link Doctor.resolve}, when the base's `@Dose`
 *   dependencies are SCOPED.
 * - **Any class more-derived than the base declares its own `@Dose`
 *   fields** — including an *intermediate* class in a multi-level chain:
 *   those fields initialize *after* `super()`, so treating in the base
 *   wrapper would fill then immediately re-define them to `undefined`
 *   (class fields use define semantics), silently wiping the injection.
 *   The `@Dose`-adding class (leaf or intermediate) must carry its own
 *   `@Inoculate` (repeating any scope), or the instance must be built
 *   through {@link Doctor.resolve} / {@link Doctor.dispense}, which treat
 *   after construction completes.
 *
 * For per-instance scope (typical web-request handlers), use
 * {@link Doctor.resolve} instead — it bypasses the wrapper and
 * treats with a caller-supplied scope.
 *
 * @param scope - Optional default scope to thread to SCOPED dependencies.
 * @returns A class decorator returning a wrapped constructor.
 *
 * @throws Propagated from `Doctor.treat` at `new` time when a
 *   required `@Dose` dependency cannot be resolved.
 */
export function Inoculate(scope?: string): ClassDecorator {
  return function (target: any) {
    const original = target;
    const f: any = function (...args: any[]) {
      // Forward `new.target` so `class Sub extends Wrapped {}` builds
      // instances on Sub.prototype — `instanceof Sub` holds and Sub's
      // own members exist. A plain (`new`-less) call has no
      // `new.target`; fall back to the wrapper, which shares the
      // original's prototype, preserving the pre-existing behaviour.
      const t = new.target;
      const instance = Reflect.construct(original, args, t ?? f);
      // Skip only when Doctor is constructing *this exact instance* —
      // i.e. `resolve`/`dispense` called `Reflect.construct(t)` and this
      // wrapper is running as its `super()`. The driving call treats it
      // once, afterwards, with the caller's scope; treating here too
      // would double-inject. `constructing(t)` matches by the identity
      // of the class under construction, so an *unrelated* `new` during
      // some other in-flight operation (e.g. a `@Vial` factory building
      // a collaborator) is NOT suppressed and still auto-treats.
      //
      // `Doctor.autoTreat` IS the auto-treat: outside an operation it is a
      // plain `treat` with the decoration-time `scope`. When this `new` runs
      // inside a registered `@Vial` factory Doctor is driving, it still
      // treats with the decoration-time `scope` only — a collaborator the
      // factory builds but does not return never inherits the operation
      // scope. The operation-scope fallback is reserved for the value the
      // factory *returns*: if this instance's own-scope treat fails purely
      // for want of a scope, autoTreat defers the verdict, and the driving
      // `dispense`/`resolve` applies the fallback (and the single treat) only
      // once the factory has returned this exact instance.
      if (!Doctor.constructing(t) && shouldAutoTreat(f, original, t)) {
        Doctor.autoTreat(instance, scope);
      }
      return instance;
    };
    f.prototype = original.prototype;

    // Inherit static members from the original class.
    Object.setPrototypeOf(f, original);

    // Preserve constructor.name so reflection keeps working.
    Object.defineProperty(f, 'name', {
      value: original.name,
      configurable: true,
    });

    // Stash a link back to the original so Doctor.resolve can
    // bypass this wrapper and treat with its own scope.
    Object.defineProperty(f, '__doctorOriginal', {
      value: original,
      enumerable: false,
      configurable: false,
      writable: false,
    });

    return f;
  };
}
