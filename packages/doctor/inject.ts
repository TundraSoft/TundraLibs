/**
 * @fileoverview `inject` — Doctor's one injection primitive. Resolve by
 * a typed label, by the class itself, or — untyped — by a name string.
 * Used as a field initializer or constructor default it wires an
 * instance while it constructs; inside a getter it injects lazily.
 *
 * @module
 */
import { _ambientContainer, _ambientScope, Doctor } from './Doctor.ts';
import type { Label, Vial } from './types/mod.ts';

/**
 * Resolve a dependency.
 *
 * - `inject(Db)` — `Db` a label from `label<BlogDb>('Db')` — returns what
 *   `Doctor.stock` put under it, typed by the label.
 * - `inject(Config)` — the class — returns the registered instance,
 *   honouring its lifecycle, typed as the class.
 * - `inject('Config')` — a name string — the UNTYPED escape hatch for
 *   dynamic wiring (a token read from config); returns `unknown`. Prefer a
 *   label: it is typed and survives minification.
 *
 * Resolution runs against the ambient container — the one whose
 * `dispense`/`resolve` is currently constructing — falling back to the
 * global `Doctor` when no container operation is in flight. `scope`
 * likewise falls back to that operation's ambient scope.
 *
 * @throws {UnregisteredVialError} When nothing is registered or stocked
 *   under the target.
 * @throws {ScopeRequiredError} When the target is SCOPED and no scope is
 *   given or ambient.
 * @throws {CircularDependencyError} When two eager `inject()` initializers
 *   point at each other — break it with a lazy getter.
 */
export function inject<T>(target: Vial<T> | Label<T>, scope?: string): T;
export function inject(token: string, scope?: string): unknown;
export function inject(
  target: Vial | Label | string,
  scope?: string,
): unknown {
  const container = _ambientContainer() ?? Doctor;
  const effective = scope ?? _ambientScope();
  return typeof target === 'string'
    ? container.dispenseByName(target, effective)
    : container.dispense(target, effective);
}
