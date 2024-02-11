/**
 * Makes all properties of an object and its nested properties readonly.
 * @template T - The type to make readonly.
 * @param {T} obj - The object to make readonly.
 * @returns {DeepReadOnly<T>} - The new type with all properties made readonly.
 */
export type DeepReadOnly<T> = { readonly [P in keyof T]: DeepReadOnly<T[P]> };

type test = { type: 'A' | 'B'; name: string; age: number };

const someFunc = (param: test) => {
};

someFunc({ type: 'A', name: 'test', age: 32 });

type a = { readonly a: string; readonly b: number };
