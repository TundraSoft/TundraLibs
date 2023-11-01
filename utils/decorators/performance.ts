function MeasurePerformance(
  target: object,
  key: string,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const originalMethod = descriptor.value;

  descriptor.value = function (...args: unknown[]) {
    const start = performance.now();
    const result = originalMethod.apply(this, args);
    const end = performance.now();

    console.log(`${key} took ${(end - start).toFixed(2)} ms to execute.`);
    return result;
  };

  return descriptor;
}
