/**
 * @fileoverview {@link RapidApplicationFactoryOptions} — config-loading options for
 * the `Application.initialize()` factory.
 *
 * @module
 */

import type { LoadConfigOptions } from '@tundralibs/utils';
import type { RapidUiTemplateOptions } from '../UiTemplateOptions.ts';

/** {@link rapid} factory inputs — `loadConfig` options plus ours. */
export type RapidApplicationFactoryOptions = LoadConfigOptions & {
  /**
   * The config set (file name, sans extension) holding the
   * application's {@link RapidApplicationOptions}.
   * @default 'Application'
   */
  applicationSet?: string;
  /**
   * The UI CODE half for a config-driven app — templates and functions
   * YAML cannot express (`core`, `layout`, `view`, error templates,
   * `assets`). Merged with the YAML `ui:` data half; the two halves are
   * typed disjoint, so nothing can be configured twice.
   */
  ui?: RapidUiTemplateOptions;
};
