// deno-lint-ignore-file no-explicit-any
import { Singleton } from '../utils/mod.ts';
// import 'npm:reflect-metadata@^0.2.2';
import '$meta';

import type { Factory, Prescription, Vial, VialModes } from './types/mod.ts';

/**
 * The Injector class is responsible for managing dependencies and providing instances of vials.
 */
@Singleton
class Injector {
  private services = new Map<string, VialModes>();
  private serviceInstances = new Map<string, any>();
  private scopes = new Map<string, Map<string, any>>();
  private resolutionStack: string[] = []; // Track dependency resolution to detect circular dependencies

  /**
   * Adds a vial to the vaccine.
   * @param constructor - The constructor function of the vial.
   * @param type - The type of the vial. Defaults to 'SINGLETON'.
   */
  public addPrescription(
    constructor: Vial,
    type: VialModes = 'SINGLETON',
  ): void {
    const name = constructor.name;
    if (this.services.has(name)) {
      console.warn(
        `Service "${name}" is already registered and will be overwritten.`,
      );
    }
    this.services.set(name, type);
    if (type === 'SINGLETON') {
      try {
        this.serviceInstances.set(name, new constructor());
      } catch (error) {
        throw new Error(
          `Failed to instantiate singleton "${name}": ${
            (error as Error).message
          }`,
        );
      }
    }
  }

  /**
   * Adds a factory function to create a vial.
   * @param name - The name for this factory service.
   * @param factory - The factory function.
   * @param type - The type of service. Defaults to 'SINGLETON'.
   */
  public addFactory<T>(
    name: string,
    factory: Factory<T>,
    type: VialModes = 'SINGLETON',
  ): void {
    if (this.services.has(name)) {
      console.warn(
        `Service "${name}" is already registered and will be overwritten.`,
      );
    }
    this.services.set(name, type);
    if (type === 'SINGLETON') {
      try {
        this.serviceInstances.set(name, factory());
      } catch (error) {
        throw new Error(
          `Failed to instantiate singleton "${name}" using factory: ${
            (error as Error).message
          }`,
        );
      }
    }
  }

  /**
   * Retrieves the dependency instance for the specified vial type or name.
   * @param typeOrName - The vial type or registered name string.
   * @param scope - The optional scope for scoped services.
   * @returns The dependency instance.
   * @throws {Error} If the service is not registered or scope is required but not provided.
   */
  public getPrescription<T>(typeOrName: Vial<T> | string, scope?: string): T {
    // Remove debug log
    // Get the service name (either constructor name or the string name for factories)
    const name = typeof typeOrName === 'string' ? typeOrName : typeOrName.name;

    // Check for circular dependencies with a more detailed message
    if (this.resolutionStack.includes(name)) {
      const cycle = [...this.resolutionStack, name].join(' → ');
      throw new Error(
        `Circular dependency detected: ${cycle}\nThis usually happens when two or more services depend on each other.`,
      );
    }

    // Add maximum resolution depth check to prevent infinite recursion
    const MAX_RESOLUTION_DEPTH = 100; // Adjust based on your application's needs
    if (this.resolutionStack.length >= MAX_RESOLUTION_DEPTH) {
      throw new Error(
        `Maximum dependency resolution depth exceeded (${MAX_RESOLUTION_DEPTH}). ` +
          `Current resolution path: ${this.resolutionStack.join(' → ')}`,
      );
    }

    // Add to resolution stack to track this dependency
    this.resolutionStack.push(name);

    try {
      const config = this.services.get(name);

      if (!config) {
        throw new Error(
          `Service "${name}" is not registered. Did you forget to add @Vial decorator?`,
        );
      }

      let dependency;

      if (config === 'SINGLETON') {
        dependency = this.serviceInstances.get(name);
      } else if (config === 'SCOPED') {
        if (!scope) {
          scope = crypto.randomUUID();
          console.warn(
            `No scope provided for scoped service "${name}". Generated random scope: ${scope}`,
          );
        }
        if (!this.scopes.has(scope)) {
          this.scopes.set(scope, new Map());
        }
        const scopeInstances = this.scopes.get(scope)!;
        if (!scopeInstances.has(name)) {
          try {
            // We need to check if the typeOrName is a constructor or a string
            const instance = typeof typeOrName === 'string'
              ? null // Can't instantiate a string
              : new typeOrName();
            scopeInstances.set(name, instance);
          } catch (error) {
            throw new Error(
              `Failed to instantiate scoped service "${name}": ${
                (error as Error).message
              }`,
            );
          }
        }
        dependency = scopeInstances.get(name);
      } else if (config === 'TRANSIENT') {
        try {
          // Again, we need to check if typeOrName is a constructor or string
          dependency = typeof typeOrName === 'string'
            ? null // Can't instantiate a string
            : new typeOrName();
        } catch (error) {
          throw new Error(
            `Failed to instantiate transient service "${name}": ${
              (error as Error).message
            }`,
          );
        }
      }

      if (!dependency) {
        throw new Error(`Failed to resolve dependency for "${name}"`);
      }

      return dependency as T;
    } finally {
      // Always remove from resolution stack, even if an error occurred
      this.resolutionStack.pop();
    }
  }

  /**
   * Injects dependencies into the class
   * @param instance - The instance to inject dependencies into.
   * @param scope - Optional scope for resolving dependencies.
   * @throws Error if a dependency is not found for a given type.
   */
  public inoculate(instance: any, scope?: string): void {
    if (!instance) {
      throw new Error(
        'Cannot inject dependencies into undefined or null instance',
      );
    }

    const constructor = instance.constructor;
    if (!constructor) {
      throw new Error('Instance has no constructor property');
    }

    const dependencies: Prescription[] =
      Reflect.getMetadata('design:injectable', constructor) || [];

    if (dependencies.length === 0) {
      console.warn(
        `No injectable dependencies found for ${constructor.name}. Did you forget to use @Dose decorator?`,
      );
    }

    for (const { key, type, isFactory, isValue } of dependencies) {
      try {
        let dependency;

        if (isValue) {
          // Direct value injection - just use the value as is
          dependency = type;
        } else if (isFactory) {
          // Factory function - verify it's a function and call it
          if (typeof type !== 'function') {
            throw new Error(`Factory for ${String(key)} is not a function`);
          }

          try {
            const factory = type as Factory<unknown>;
            dependency = factory();
          } catch (factoryError) {
            throw new Error(
              `Factory for ${String(key)} failed: ${
                (factoryError as Error).message
              }`,
            );
          }
        } else {
          // Standard dependency - lookup from registry
          const typeName = typeof type === 'function' ? type.name : null;

          if (typeName && this.services.has(typeName)) {
            dependency = this.getPrescription(type as Vial, scope);
          } else if (typeof key === 'string' && this.services.has(key)) {
            // Try to use the property name as service name
            dependency = this.getPrescription(key, scope);
          } else {
            dependency = this.getPrescription(type as Vial, scope);
          }
        }

        if (dependency === undefined) {
          throw new Error(
            `Dependency resolved to undefined for ${String(key)}`,
          );
        }

        instance[key] = dependency;
      } catch (error) {
        throw new Error(
          `Failed to inject ${String(key)} into ${constructor.name}: ${
            (error as Error).message
          }`,
        );
      }
    }
  }
}

/**
 * Represents a Vaccine object.
 * This object is used for dependency injection.
 */
export const Vaccine: Injector = new Injector();
