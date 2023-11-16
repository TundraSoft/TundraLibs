/**
 * debounces a method call
 *
 * @param milliseconds Time in milliseconds to delay consequent calls
 * @returns original method wrapped with debounce logic
 */
export function debounce(milliseconds: number) {
  return function (
    _target: unknown,
    _key: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    let timerId: number | undefined = undefined; // The timer ID for the current debounce
    const originalMethod = descriptor.value; // The original method that will be debounced

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => {
        originalMethod.apply(this, args); // Invoke the original method with the provided arguments
      }, milliseconds);
    };
    addEventListener('unload', () => {
      clearTimeout(timerId);
    });
    return descriptor;
  };
}
