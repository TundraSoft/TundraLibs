/**
 * @fileoverview {@link RapidModulePayload} — the phantom marker a module
 * uses to DECLARE an event and its payload type in one place:
 * `readonly events = { PostCreated: event<{ id: string }>() }`.
 *
 * @module
 */

/** Carries the payload type `T` of a declared event; nothing at runtime. */
export type RapidModulePayload<T> = {
  /** Phantom carrier for `T`; exists in the type only, never set. */
  readonly __payload?: T;
};
