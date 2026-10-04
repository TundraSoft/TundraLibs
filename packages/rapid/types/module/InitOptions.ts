/**
 * @fileoverview {@link RapidModuleInitOptions} — the standalone form of
 * the runtime context: plain application options from which the runtime
 * builds the config + logger exactly as `Application` does.
 *
 * @module
 */

import type { RapidApplicationOptions } from '../mod.ts';
import type { RapidAuthBinding } from '../AuthBinding.ts';

/**
 * `name` is required (slogger's appName); `mode`/`logger` as on the app;
 * `auth` is the binding that judges `access` strings on `invoke()` —
 * required when a mounted module declares any (RAPID_AUTH_UNBOUND).
 */
export type RapidModuleInitOptions =
  & Pick<RapidApplicationOptions, 'name' | 'mode' | 'logger'>
  & { auth?: RapidAuthBinding };
