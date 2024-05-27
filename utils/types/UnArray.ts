/**
 * Extracts the element type from an array type.
 * If the input type is not an array, it returns the input type itself.
 *
 * @template T - The input type.
 * @returns The element type of the array or the input type itself.
 */
export type UnArray<T> = T extends Array<infer U> ? U : T;
