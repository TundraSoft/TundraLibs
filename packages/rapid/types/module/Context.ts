/**
 * @fileoverview {@link RapidModuleContext} — what the module runtime
 * needs from its host: the logger, the config, and the disclosure mode.
 * An `Application` passes its own; standalone callers pass options and
 * the runtime builds these through the same builders.
 *
 * @module
 */

import type { Slogger } from '@tundralibs/slogger';
import type { ConfigType } from '@tundralibs/utils';
import type { RapidAuthBinding } from '../AuthBinding.ts';

/** The host-provided runtime context. */
export type RapidModuleContext = {
  /** The host's logger (ambient-correlated at emit time). */
  log: Slogger;
  /** The host's configuration. */
  config: ConfigType;
  /**
   * Error-disclosure mode for invocation failures (`DEVELOPMENT` shows
   * detail, `PRODUCTION` hides it).
   * @default 'PRODUCTION'
   */
  mode?: 'DEVELOPMENT' | 'PRODUCTION';
  /**
   * The auth binding that judges `access` strings on `invoke()`. An app
   * passes a RESOLVER (`() => app.authBinding`) so `app.auth()` may be
   * called before or after `app.modules()`; a standalone runtime (tests,
   * scripts) passes the binding itself. Absent on a standalone runtime
   * whose modules declare `access` → the boot fails (RAPID_AUTH_UNBOUND).
   */
  auth?: RapidAuthBinding | (() => RapidAuthBinding | undefined);
};
