/**
 * @fileoverview Cross-runtime CLI helpers — argument access, terminal
 * info, line-based prompts, and in-place display widgets.
 *
 * Re-exports from focused submodules so callers can either pull
 * everything via `@tundralibs/compat/cli` or reach into a single area:
 *
 * - {@link "./args.ts" | args/argv} — process invocation tokens + parser
 * - {@link "./terminal.ts" | terminal} — TTY detection, terminal size
 * - {@link "./prompt.ts" | prompt/choose} — line-based interactive input
 * - {@link "./progress.ts" | ProgressBar} — in-place progress rendering
 * - {@link "./spinner.ts" | Spinner} — animated loading indicator
 *
 * @module
 */

export { args, argv, type ArgValue, type ParsedArgs } from './args.ts';
export { consoleSize, isTTY } from './terminal.ts';
export {
  choose,
  type ChooseOptions,
  prompt,
  type PromptOptions,
} from './prompt.ts';
export {
  ProgressBar,
  type ProgressBarOptions,
  type WritableLike,
} from './progress.ts';
export {
  Spinner,
  SPINNER_FRAMES_ASCII,
  SPINNER_FRAMES_BRAILLE,
  type SpinnerOptions,
} from './spinner.ts';
