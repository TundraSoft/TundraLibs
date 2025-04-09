/**
 * Creates a new type by making specified properties of the input type required.
 *
 * @template T - The input type.
 * @template K - The keys of the properties to make required.
 * @param {T} obj - The input object.
 * @returns {MakeRequired<T, K>} - The new type with specified properties made required.
 */
export type MakeRequired<T, K extends keyof T> =
  & Required<Pick<T, K>>
  & Omit<T, K>;
