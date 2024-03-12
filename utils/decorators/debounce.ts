/**
 * debounces a method call. The first time it is called, it executes, however
 * further calls will be delayed by the provided amount of time. Each time
 * the call is made during the delay will reset and extend the delay.
 * The cached response will be returned for each call during the delay.
 *
 * @param delay Time in seconds to delay consequent calls
 * @returns original method wrapped with debounce logic
 */
export function debounce(delay: number) {
  return function (
    _target: unknown,
    _key: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const milliseconds = delay * 1000; // Convert seconds to milliseconds
    let lastCallTime = 0; // The last time the method was called
    const originalMethod = descriptor.value;
    let lastReturn: ReturnType<typeof descriptor.value> = undefined;

    descriptor.value = function (...args: unknown[]) {
      if (
        lastCallTime === 0 || performance.now() > (lastCallTime + milliseconds)
      ) {
        lastReturn = originalMethod.apply(this, args);
      }
      lastCallTime = performance.now();
      return lastReturn;
    };

    return descriptor;
  };
}
