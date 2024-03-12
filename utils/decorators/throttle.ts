/**
 * Throttles a class method. The first time it is called, it executes, however
 * further calls will be delayed by the provided amount of time.
 * The cached response will be returned for each call during the delay.
 *
 * @param delay Time in seconds to delay consequent calls
 * @returns original method wrapped with throttle logic
 */
export function throttle(delay: number) {
  return function (
    _target: unknown,
    _key: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    let lastRunTime = 0; // The last time the method was called
    const originalMethod = descriptor.value; // The original method that will be throttled
    const milliseconds = delay * 1000; // Convert seconds to milliseconds
    let lastReturn: ReturnType<typeof descriptor.value> = undefined; // The last return value of the method

    descriptor.value = function(...args: unknown[]) {
      // deno-lint-ignore no-this-alias
      const self = this;
      if (lastRunTime === 0 || (performance.now() - lastRunTime > milliseconds)) {
        lastRunTime = performance.now();
        lastReturn = originalMethod.apply(self, args); // Invoke the original method with the provided arguments
      }
      return lastReturn;
    }

    return descriptor;

  };
}
