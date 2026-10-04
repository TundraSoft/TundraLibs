/**
 * @fileoverview {@link RapidUiComposeOptions} — the caps every composed
 * page runs under (`ui.compose` in Application options / YAML).
 *
 * @module
 */

/** Limits for routes declaring `compose`; one set per app, never per route. */
export type RapidUiComposeOptions = {
  /**
   * The most parts a page may declare — a larger `compose` fails the
   * boot, which also bounds what one `?parts=` request can ask for.
   * @default 5
   */
  maxParts?: number;
  /** Parts run at once, on first paint and on the follow-up fetch alike. @default 4 */
  concurrency?: number;
  /** Seconds a part may take before it answers a 504 envelope. @default 2 */
  timeout?: number;
};
