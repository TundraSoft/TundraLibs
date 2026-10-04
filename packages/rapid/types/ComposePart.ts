/**
 * @fileoverview {@link RapidComposePart} — one part of a composed page:
 * the resource action it runs, how the page's path params reach it, and
 * whether it is deferred to the follow-up fetch.
 *
 * @module
 */

/** The long form of a `compose` entry; the short form is the `action` string alone. */
export type RapidComposePart = {
  /**
   * The action that produces the part, addressed like an event:
   * `'namespace:Module:method'`. Resolved at boot to a mounted module
   * method (`RAPID_COMPOSE_UNKNOWN_ACTION` otherwise); a method served by
   * a non-GET route is refused — a part is a read.
   */
  action: string;
  /**
   * How the target's `param()` binders are fed: target param name → the
   * page's path param name. Absent, each target param takes the page's
   * path param of the SAME name; a target param the page cannot supply
   * either way fails the boot.
   */
  params?: Readonly<Record<string, string>>;
  /**
   * Leave this part out of the first paint: the slot renders a
   * placeholder and the client runtime fetches every deferred part in ONE
   * follow-up request (`GET <page>?parts=a,b`). @default false
   */
  defer?: boolean;
};
