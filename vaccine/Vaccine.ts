// deno-lint-ignore-file no-explicit-any
import { singleton } from '../utils/mod.ts';
import 'npm:reflect-metadata';

import type { Prescription, Vial, VialModes } from './types/mod.ts';

/**
 * The Injector class is responsible for managing dependencies and providing instances of vials.
 */
@singleton
class Injector {
  private services = new Map<string, VialModes>();
  private serviceInstances = new Map<string, any>();
  private scopes = new Map<string, Map<string, any>>();

  /**
   * Adds a vial to the vaccine.
   * @param constructor - The constructor function of the vial.
   * @param type - The type of the vial. Defaults to 'SINGLETON'.
   */
  public addPrescription(constructor: Vial, type: VialModes = 'SINGLETON') {
    this.services.set(constructor.name, type);
    if (type === 'SINGLETON') {
      this.serviceInstances.set(constructor.name, new constructor());
    }
  }

  /**
   * Retrieves the dependency instance for the specified vial type.
   * @param type - The vial type.
   * @param scope - The optional scope for scoped services.
   * @returns The dependency instance.
   * @throws {Error} If the scope is required for scoped services but not provided.
   */
  public getPrescription(type: Vial, scope?: string) {
    const config = this.services.get(type.name);
    let dependency;

    if (config === 'SINGLETON') {
      dependency = this.serviceInstances.get(type.name);
    } else if (config === 'SCOPED') {
      if (!scope) {
        scope = crypto.randomUUID();
      }
      if (!this.scopes.has(scope)) {
        this.scopes.set(scope, new Map());
      }
      const scopeInstances = this.scopes.get(scope)!;
      if (!scopeInstances.has(type.name)) {
        scopeInstances.set(type.name, new type());
      }
      dependency = scopeInstances.get(type.name);
    } else if (config === 'TRANSIENT') {
      dependency = new type();
    }
    return dependency;
  }

  /**
   * Injects dependencies into the class
   * @param instance - The instance to inject dependencies into.
   * @param scope - Optional scope for resolving dependencies.
   * @throws Error if a dependency is not found for a given type.
   */
  public innoculate(instance: any, scope?: string) {
    const dependencies: Prescription[] =
      Reflect.getMetadata('design:injectable', instance.constructor) || [];
    for (const { key, type } of dependencies) {
      const dependency = this.getPrescription(type, scope);
      if (!dependency) {
        throw new Error(`No dependency found for ${type.name}`);
      }
      instance[key] = dependency;
    }
  }
}

/**
 * Represents a Vaccine object.
 * This object is used for dependency injection.
 */
export const Vaccine = new Injector();
