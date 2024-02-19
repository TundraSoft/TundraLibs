/**
 * Throttles a class method
 *
 * @param milliseconds Time in milliseconds to delay consequent calls
 * @returns original method wrapped with throttle logic
 */
export function throttle(milliseconds: number) {
  return function (
    _target: unknown,
    _key: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    let timerId: number | undefined = undefined; // The timer ID for the current throttle
    let runnable = true;
    const originalMethod = descriptor.value; // The original method that will be throttled

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      if (runnable === true) {
        runnable = false;
        timerId = setTimeout(() => {
          runnable = true;
        }, milliseconds);
        return originalMethod.apply(this, args); // Invoke the original method with the provided arguments
      }
    };

    addEventListener('unload', () => {
      clearTimeout(timerId);
    });

    return descriptor;
  };
}
