import { Metrics } from '../mod.ts';

export function tick(
  target: object,
  key: string,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const originalMethod = descriptor.value;
  const metric = new Metrics();
  const name = `${target.constructor.name}::${key}`;

  descriptor.value = async function (...args: unknown[]) {
    metric.mark(name);
    const result = await originalMethod.apply(this, args);
    metric.mark(name);
    return result;
  };

  return descriptor;
}
