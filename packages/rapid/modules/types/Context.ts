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
};
