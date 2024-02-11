/**
 * Removes properties with a value of `never` from the input type.
 *
 * @template T - The input type.
 * @param {T} obj - The input object.
 * @returns {ExcludeNever<T>} - The resulting type after excluding properties with a value of `never`.
 */
export type ExcludeNever<T> =
  { [K in keyof T as T[K] extends never ? never : K]: T[K] } extends infer O
    ? { [K in keyof O]: O[K] }
    : never;
