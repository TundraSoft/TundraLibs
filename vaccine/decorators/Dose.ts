import type { Factory, Prescription } from '../types/mod.ts';

/**
 * Decorator function used to mark a property as injectable.
 *
 * @param options - Optional configuration for the injection
 * @returns A function that takes the target object and property key as parameters.
 */
export function Dose(options?: {
  isFactory?: boolean;
  isValue?: boolean;
}): PropertyDecorator {
  const { isFactory = false, isValue = false } = options || {};

  return function (target: object, key: string | symbol) {
    // Get the type metadata from reflect-metadata
    const type = Reflect.getMetadata('design:type', target, key);

    if (!type && !isValue) {
      console.warn(
        `No type information found for property ${
          String(key)
        } in ${target.constructor.name}. 
      Make sure emitDecoratorMetadata is enabled in your tsconfig.json.`,
      );
    }

    if (isFactory && isValue) {
      throw new Error('Property cannot be both a factory and a value');
    }

    // Initialize injectable metadata array if it doesn't exist
    if (!Reflect.hasMetadata('design:injectable', target.constructor)) {
      Reflect.defineMetadata('design:injectable', [], target.constructor);
    }

    // Get existing injectables
    const injectables: Prescription[] = Reflect.getMetadata(
      'design:injectable',
      target.constructor,
    );

    // Add new injectable
    injectables.push({
      key,
      type,
      isFactory,
      isValue,
    });
  };
}

/**
 * Decorator for injecting factory functions
 * @param factory The factory function that will produce the value
 */
export function DoseFactory<T>(factory: Factory<T>): PropertyDecorator {
  return function (target: object, key: string | symbol) {
    if (!Reflect.hasMetadata('design:injectable', target.constructor)) {
      Reflect.defineMetadata('design:injectable', [], target.constructor);
    }

    const injectables: Prescription[] = Reflect.getMetadata(
      'design:injectable',
      target.constructor,
    );

    injectables.push({
      key,
      type: factory,
      isFactory: true,
    });
  };
}

/**
 * Decorator for injecting constant values
 * @param value The constant value to inject
 */
export function DoseValue<T>(value: T): PropertyDecorator {
  return function (target: object, key: string | symbol) {
    if (!Reflect.hasMetadata('design:injectable', target.constructor)) {
      Reflect.defineMetadata('design:injectable', [], target.constructor);
    }

    const injectables: Prescription[] = Reflect.getMetadata(
      'design:injectable',
      target.constructor,
    );

    injectables.push({
      key,
      type: value,
      isValue: true,
    });
  };
}
