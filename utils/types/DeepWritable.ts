/**
 * Makes all properties of an object writable, including nested properties.
 * @template T - The type of the object.
 * @param {T} obj - The object to make writable.
 * @returns {DeepWritable<T>} - The new type with all properties made writable.
 */
export type DeepWritable<T> =
  { -readonly [P in keyof T]: DeepWritable<T[P]> } extends infer O
    ? { [K in keyof O]: O[K] }
    : never;
