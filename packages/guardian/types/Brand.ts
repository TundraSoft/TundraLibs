/**
 * Phantom tag carried by {@link Brand}. Declared but never defined,
 * and keyed by a `unique symbol`, so it exists only in the type
 * system — nothing is added to the runtime value and the key cannot
 * collide with a real field on the branded type.
 *
 * @internal
 */
declare const __guardianBrand: unique symbol;

/**
 * Nominal brand. Intersects a base type `T` with a phantom tag `B` so
 * the compiler treats two structurally-identical types as distinct.
 *
 * TypeScript is structurally typed: a `UserId` that is "just a string"
 * is interchangeable with every other string, so nothing stops an
 * order id — or a raw form field — from being passed where a user id
 * is expected. A brand fixes that without changing the runtime value:
 * `Brand<string, 'UserId'>` still *is* a `string` at runtime, but is
 * assignment-incompatible with a bare `string` and with
 * `Brand<string, 'OrderId'>`.
 *
 * This is the type {@link BaseGuardian.brand} produces, so most code
 * gets it by inference (`Guardian.infer<typeof UserId>`). Name it
 * explicitly when the alias has to exist independently of the
 * guardian — a function parameter, an interface field, a type in a
 * package that doesn't import the schema.
 *
 * Because the tag is phantom, a value can only enter the branded type
 * through a guardian's `.parse()` (the checked route) or through an
 * assertion at a boundary you trust (`'u_1' as UserId`). That is the
 * point: minting is deliberate and greppable.
 *
 * @template T - The underlying runtime type (`string`, `number`, …).
 * @template B - The brand tag, usually a string literal naming the
 *   semantic type (`'UserId'`, `'Email'`, `'AccountNumber'`).
 *
 * @example Declaring and using a branded alias
 * ```ts
 * import { type Brand } from '@tundralibs/guardian';
 *
 * type UserId = Brand<string, 'UserId'>;
 *
 * // A UserId still IS a string, so string operations keep working.
 * function shorten(id: UserId): string {
 *   return id.slice(0, 8);
 * }
 *
 * // Minting one at a trusted boundary takes a deliberate assertion.
 * shorten('u_01HZY4' as UserId);
 * ```
 *
 * @example Two brands over the same base type don't mix
 * ```ts ignore
 * import { type Brand } from '@tundralibs/guardian';
 *
 * type UserId = Brand<string, 'UserId'>;
 * type OrderId = Brand<string, 'OrderId'>;
 *
 * const a: UserId = 'u_1' as UserId;
 * const b: OrderId = a; // ❌ compile error
 * const c: UserId = 'u_1'; // ❌ compile error — raw string
 * ```
 */
export type Brand<T, B extends string | symbol> = T & {
  readonly [__guardianBrand]: B;
};
