/**
 * Creates a new type that makes specified properties of an object read-only.
 * @template T - The original object type.
 * @template K - The keys of the properties to make read-only.
 * @param {T} obj - The original object.
 * @returns {MakeReadOnly<T, K>} - The new type with specified properties made read-only.
 */
export type MakeReadOnly<T, K extends keyof T | unknown> = K extends keyof T
  ? Readonly<Pick<T, K>> & Omit<T, K>
  : T;
