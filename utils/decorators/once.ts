const AsyncFunction = (async function () {}).constructor; // NOSONAR

/**
 * once
 *
 * Ensures a method can only be called once. All consecutive calls will return the result of the first call.
 *
 * @param _target The class that the method is a member of
 * @param _propertyKey The name of the method
 * @param descriptor The PropertyDescriptor for the method (function)
 * @returns method wrapped with once functionality.
 */
export const once = (
  _target: unknown,
  _propertyKey: string,
  descriptor: PropertyDescriptor,
) => {
  const originalMethod = descriptor.value;
  let called = false;
  let result: unknown;

  // Check if originalMethod is an async function
  if (originalMethod instanceof AsyncFunction) {
    descriptor.value = async function (...args: unknown[]) {
      if (called) {
        return result;
      } else {
        called = true;
        // deno-lint-ignore ban-types
        result = await (originalMethod as Function).apply(this, args);
        return result;
      }
    };
  } else {
    descriptor.value = function (...args: unknown[]) {
      if (called) {
        return result;
      } else {
        called = true;
        result = originalMethod.apply(this, args);
        return result;
      }
    };
  }

  return descriptor;
};
