/**
 * @fileoverview The public surface of a Doctor container — the type
 * behind the global `Doctor` and every `Doctor.createContainer()`
 * child.
 *
 * @module
 */

import type { Label } from './Label.ts';
import type { StockOptions } from './StockOptions.ts';
import type { Vial } from './Vial.ts';
import type { VialModes } from './VialModes.ts';
import type { VialOptions } from './VialOptions.ts';

/**
 * The public contract of a dependency-injection container. The global
 * `Doctor` is one; {@link DoctorContainer.createContainer} returns a
 * **child** that reads registrations through to its parent yet keeps
 * its own singleton instances, scope maps, and stocked values. A
 * `@Vial` class registered into the parent therefore resolves in a
 * child as a **distinct** instance, and `stock` on a child overrides a
 * dependency for that child alone — the parent and sibling containers
 * are never touched.
 *
 * Consumers that hold a child annotate it with this type:
 *
 * ```ts
 * import { Doctor } from '@tundralibs/doctor';
 * import type { DoctorContainer } from '@tundralibs/doctor/types';
 *
 * const container: DoctorContainer = Doctor.createContainer();
 * ```
 */
export interface DoctorContainer {
  /**
   * Register a class with the given lifecycle. Short form takes the
   * mode literal; long form takes a {@link VialOptions} object with an
   * optional `factory` for classes that need constructor args.
   *
   * @throws {DuplicateVialError} When `type` is already registered in
   *   this container, or a label is already stocked under its class name.
   */
  prescribe(type: Vial, mode: VialModes): void;
  /** Long form — register with explicit {@link VialOptions}. */
  prescribe(type: Vial, options: VialOptions): void;

  /**
   * Stock a ready-made value under a {@link Label} or bare name, a
   * ready instance under its class, or a labelled factory with a
   * lifecycle. Writes to **this** container only, so a child stocking a
   * name the parent already holds overrides it locally without mutating
   * the parent.
   *
   * @throws {DuplicateVialError} When the name is already taken in this
   *   container, or — in the class form — the class is already registered
   *   here.
   */
  stock<T>(type: Vial<T>, value: NoInfer<T>): void;
  /** Value form — stock a ready value under a {@link Label} or bare name. */
  stock<T>(labelOrName: Label<T> | string, value: NoInfer<T>): void;
  /** Factory form — a lifecycle-managed {@link StockOptions}. */
  stock<T>(
    labelOrName: Label<T> | string,
    options: StockOptions<NoInfer<T>>,
  ): void;

  /**
   * Revoke the registration behind `target` from **this** container
   * only, dropping its cached singleton and per-scope entries. Returns
   * `true` when a registration was actually removed here — `false` when
   * `target` existed only on the parent.
   */
  revoke(target: Vial | Label | string): boolean;

  /**
   * Hand out an instance of a registered vial, or whatever is stocked
   * under a label, honouring its mode. The registration is found via
   * this container then its parent, but the SINGLETON / SCOPED instance
   * is constructed and cached in **this** container.
   *
   * @throws {UnregisteredVialError} When neither this container nor its
   *   parent has an entry for the class or label.
   * @throws {ScopeRequiredError} When the entry is SCOPED and no `scope`
   *   was provided.
   * @throws {CircularDependencyError} When resolution re-enters its own
   *   still-in-flight construction.
   */
  dispense<T = unknown>(vialOrLabel: Vial<T> | Label<T>, scope?: string): T;

  /**
   * Resolve a registered entry by its **name** — the token `inject`
   * uses — searching this container then its parent.
   *
   * @throws {UnregisteredVialError} When nothing is registered under
   *   `name` in this container or its parent.
   */
  dispenseByName<T = unknown>(name: string, scope?: string): T;

  /**
   * Construct a fresh instance of `type` under `scope`, honouring a
   * registered `factory` when one exists — found via this container then
   * its parent — always a new instance, even for SINGLETON registrations.
   *
   * @throws {UnregisteredVialError} / {ScopeRequiredError} When a
   *   dependency cannot be resolved.
   */
  resolve<T>(type: Vial<T>, scope?: string): T;

  /**
   * Eagerly dispense every SINGLETON registered in **this** container so
   * a missing dependency or throwing factory fails now. SCOPED and
   * TRANSIENT entries are skipped.
   *
   * @returns The number of SINGLETON entries dispensed.
   * @throws Whatever the first failing dispense throws.
   */
  checkup(): number;

  /** Drop every instance stored under `scope`. Returns whether a scope was removed. */
  discharge(scope: string): boolean;

  /** Drop every scope in this container — registrations are untouched. */
  dischargeAll(): void;

  /**
   * Drop every registration, singleton instance, and scope in **this**
   * container. Intended for test isolation.
   */
  reset(): void;

  /** Whether a vial is registered for `type` in **this** container. */
  knows(type: Vial): boolean;

  /**
   * Whether something can be dispensed for `target` — checked in this
   * container and, failing that, its parent.
   */
  has(target: Vial | Label | string): boolean;

  /**
   * Create a fresh **child** container whose parent is this one. The
   * child reads this container's registrations but keeps its own
   * singleton instances, scope maps, and stocked overrides.
   */
  createContainer(): DoctorContainer;
}
