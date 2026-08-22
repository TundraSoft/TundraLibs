/**
 * @fileoverview The request-scoped DI seam. Carries the app's doctor
 * container on the ambient request bag so a user handler's `inject()` —
 * even after an `await` — resolves against THIS app's container rather
 * than the process-wide global `Doctor`. Pinned non-enumerably (like the
 * module runtime's CURRENT slot) so the logger's `{...ambient.get()}`
 * context spread never copies it, and installed as doctor's async-context
 * provider once, from {@link Application}.
 *
 * @module
 */
import { ambient } from '@tundralibs/ambient';
import type { DoctorContainer } from '@tundralibs/doctor';

/** Ambient-bag slot holding the app container for the in-flight request. */
const CONTAINER: unique symbol = Symbol('rapid.container');
type ContainerBag = Record<string, unknown> & {
  [CONTAINER]?: DoctorContainer;
};

/**
 * Pin `container` onto the CURRENT ambient bag, non-enumerably so the
 * logger's context spread never copies it. Called at the top of every
 * request/invoke ambient scope: `ambient.child` spreads only enumerable
 * keys, so a nested scope does not inherit the slot and re-pins its own.
 * A no-op outside an ambient scope (nothing to pin onto).
 */
export function attachContainer(container: DoctorContainer): void {
  const bag = ambient.get();
  if (bag === undefined) return;
  Object.defineProperty(bag, CONTAINER, {
    value: container,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

/**
 * The app container pinned on the current ambient bag, or `undefined`
 * outside any rapid request. Installed once as doctor's container
 * provider (`setContainerProvider`), so a request-time `inject()`
 * resolves against the app handling that request.
 */
export function currentContainer(): DoctorContainer | undefined {
  return (ambient.get() as ContainerBag | undefined)?.[CONTAINER];
}
