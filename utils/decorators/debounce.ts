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
    let timeout: number | undefined = undefined;
    const originalMethod = descriptor.value;

    descriptor.value = function (this: typeof _target, ...args: unknown[]) {
      clearTimeout(timeout);
      timeout = setTimeout(
        () => {
          originalMethod.apply(this, args);
        },
        milliseconds,
      );
    };

    return descriptor;
  };
}
