/**
 * Creates a new type by making specified properties optional.
 *
 * @template T - The original type.
 * @template K - The keys of the properties to make optional.
 * @param {T} - The original object.
 * @param {K} - The keys of the properties to make optional.
 * @returns {MakeOptional<T, K>} - The new type with specified properties made optional.
 */
export type MakeOptional<T, K extends keyof T> =
  & Omit<T, K>
  & Partial<Pick<T, K>>;
