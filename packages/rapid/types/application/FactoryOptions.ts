/**
 * @fileoverview {@link RapidApplicationFactoryOptions} — config-loading options for
 * the `Application.initialize()` factory.
 *
 * @module
 */

import type { LoadConfigOptions } from '@tundralibs/utils';

/** {@link rapid} factory inputs — `loadConfig` options plus ours. */
export type RapidApplicationFactoryOptions = LoadConfigOptions & {
  /**
   * The config set (file name, sans extension) holding the
   * application's {@link RapidApplicationOptions}.
   * @default 'Application'
   */
  applicationSet?: string;
};
