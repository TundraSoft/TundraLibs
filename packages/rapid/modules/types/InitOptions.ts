/**
 * @fileoverview {@link RapidModuleInitOptions} — the standalone form of
 * the runtime context: plain application options from which the runtime
 * builds the config + logger exactly as `Application` does.
 *
 * @module
 */

import type { RapidApplicationOptions } from '../../types/mod.ts';

/** `name` is required (slogger's appName); `mode`/`logger` as on the app. */
export type RapidModuleInitOptions = Pick<
  RapidApplicationOptions,
  'name' | 'mode' | 'logger'
>;
