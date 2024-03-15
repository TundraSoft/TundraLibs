import { hash } from '../hash.ts';

/**
 * memoize decorator
 *
 * This decorator will memoize the result of a method. It will store the result of the method in a cache and return the cached result if the method is called with the same arguments.
 * *NOTE*: This decorator converts the mothod to an async method, so the method must return a Promise.
 *
 * @param _target The class that the method is a member of
 * @param _propertyKey The name of the method
 * @param descriptor The PropertyDescriptor for the method (function)
 * @returns memoized version of the method
 */
export const memoize = (
  _target: unknown,
  _propertyKey: string,
  descriptor: PropertyDescriptor,
) => {
  const originalMethod = descriptor.value;
  const cache = new Map();

  descriptor.value = async function (...args: unknown[]) {
    const key = await hash(args, { algorithm: 'SHA-256', encoding: 'HEX' });
    if (cache.has(key)) {
      return cache.get(key);
    } else {
      const result = originalMethod.apply(this, args);
      cache.set(key, result);
      return result;
    }
  };

  return descriptor;
};
