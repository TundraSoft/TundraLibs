/**
 * @fileoverview Cross-runtime line-based interactive prompts.
 *
 * Provides {@link prompt} (line read with optional password masking)
 * and {@link choose} (numbered selection menu). Built on `node:readline`
 * for line input and raw-mode stdin for password masking. Works on
 * Deno, Bun, and Node.js — Deno reaches the same Node-shaped APIs
 * through its built-in Node compat layer.
 *
 * @module
 *
 * @example Plain line read with default
 * ```ts
 * import { prompt } from '@tundralibs/compat/cli';
 *
 * const name = await prompt('Your name', { default: 'guest' });
 * ```
 *
 * @example Password (masked echo)
 * ```ts
 * const secret = await prompt('Password', { password: true });
 * ```
 *
 * @example Numbered choice
 * ```ts
 * import { choose } from '@tundralibs/compat/cli';
 *
 * const driver = await choose('Pick a driver', [
 *   'postgres',
 *   'mysql',
 *   'sqlite',
 * ]);
 * ```
 */

import { loadBuiltin } from '../_runtime-globals.ts';
import { assertBuiltin } from '../_guards.ts';

// Resolved synchronously (see {@link loadBuiltin}). Both are dereferenced
// from sync helpers (`_setRaw`, `_writeStdout`), and a top-level
// `await import()` would async-poison every bundle compat lands in.
// All three runtimes expose these; anything else gets `undefined`, which
// the helpers below already treat as "no TTY available".
const nodeReadline: typeof import('node:readline') = loadBuiltin(
  'node:readline',
);
const nodeProcess: typeof import('node:process') = loadBuiltin('node:process');

/**
 * Options for {@link prompt}.
 */
export type PromptOptions = {
  /** Returned when the user submits an empty line */
  default?: string;
  /**
   * Hide user input.
   * - `true` / `'masked'` — echoes `*` per character (typical password UX)
   * - `'silent'` — echoes nothing (sudo-style)
   *
   * Falls back transparently to a plain prompt when stdin is not a TTY
   * (piped input), since masking is meaningless in that case.
   */
  password?: boolean | 'masked' | 'silent';
};

/**
 * Toggle raw mode on stdin. Returns `false` when raw mode isn't
 * available (non-TTY stdin or unknown runtime).
 */
const _setRaw = (enabled: boolean): boolean => {
  const stdin = nodeProcess?.stdin;
  if (!stdin || typeof stdin.setRawMode !== 'function') return false;
  stdin.setRawMode(enabled);
  return true;
};

const _writeStdout = (s: string): void => {
  nodeProcess?.stdout?.write?.(s);
};

/**
 * Render a line prompt via `node:readline`. Used for the non-password
 * path, so the terminal's own line editor is in charge of left/right
 * arrows, backspace handling, etc.
 */
const _readPlainLine = (
  message: string,
  defaultValue: string | undefined,
): Promise<string> => {
  return new Promise((resolve) => {
    if (!nodeReadline || !nodeProcess) {
      resolve(defaultValue ?? '');
      return;
    }
    const rl = nodeReadline.createInterface({
      input: nodeProcess.stdin,
      output: nodeProcess.stdout,
    });
    const suffix = defaultValue !== undefined ? ` [${defaultValue}]` : '';
    rl.question(`${message}${suffix}: `, (answer: string) => {
      rl.close();
      const trimmed = answer.length === 0 ? (defaultValue ?? '') : answer;
      resolve(trimmed);
    });
  });
};

/**
 * Read a single line in raw mode, suppressing echo. We handle Enter
 * (commit), backspace (edit), and Ctrl+C (cancel) ourselves since the
 * terminal's line editor is bypassed in raw mode.
 */
const _readSecretLine = (
  message: string,
  echo: 'masked' | 'silent',
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const stdin = nodeProcess?.stdin;
    if (!stdin) {
      resolve('');
      return;
    }
    _writeStdout(`${message}: `);
    const rawAvailable = _setRaw(true);
    // Non-TTY stdin (piped) can't be raw-moded; fall back to plain read.
    if (!rawAvailable) {
      _readPlainLine(message, undefined).then(resolve, reject);
      return;
    }
    stdin.resume();
    stdin.setEncoding('utf8');

    const chars: string[] = [];
    const cleanup = () => {
      stdin.removeListener('data', onData);
      _setRaw(false);
      stdin.pause();
      _writeStdout('\n');
    };

    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') {
          cleanup();
          resolve(chars.join(''));
          return;
        }
        if (c === '\x03') {
          // Ctrl+C
          cleanup();
          reject(new Error('Cancelled by user (SIGINT)'));
          return;
        }
        if (c === '\x7f' || c === '\b') {
          if (chars.length > 0) {
            chars.pop();
            if (echo === 'masked') _writeStdout('\b \b');
          }
          continue;
        }
        chars.push(c);
        if (echo === 'masked') _writeStdout('*');
      }
    };

    stdin.on('data', onData);
  });
};

/**
 * Reads a single line from the user.
 *
 * @param message - Prompt text shown before the input cursor
 * @param options - Optional default value and password mode
 * @returns The line the user submitted, or the default if they pressed
 *   Enter on an empty line
 *
 * @throws {Error} When the user cancels with Ctrl+C during password mode
 *
 * @example
 * ```ts
 * const port = await prompt('Port', { default: '8080' });
 * const password = await prompt('Password', { password: true });
 * ```
 */
export const prompt = (
  message: string,
  options: PromptOptions = {},
): Promise<string> => {
  // Don't fake a terminal on a runtime with no line input (workerd,
  // browsers): throw rather than silently returning the default.
  assertBuiltin(nodeReadline, 'node:readline', 'prompt');
  assertBuiltin(nodeProcess, 'node:process', 'prompt');
  if (options.password) {
    const echo = options.password === 'silent' ? 'silent' : 'masked';
    return _readSecretLine(message, echo);
  }
  return _readPlainLine(message, options.default);
};

/**
 * Validates a line of user input against the choices range.
 * Returns the 1-based selection index, or `null` if the input doesn't
 * match a valid choice.
 *
 * Exposed on the module for direct unit testing — public API surface
 * is `choose()`, which loops on this until valid.
 *
 * @internal
 */
export const _validateChoice = (
  input: string,
  choiceCount: number,
  defaultIdx?: number,
): number | null => {
  const trimmed = input.trim();
  if (trimmed === '') {
    return defaultIdx !== undefined ? defaultIdx + 1 : null;
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > choiceCount) return null;
  return n;
};

/**
 * Options for {@link choose}.
 */
export type ChooseOptions = {
  /** Default selected index (0-based). User pressing Enter picks this. */
  default?: number;
};

/**
 * Display a numbered list of choices and return the picked one.
 *
 * Re-prompts on invalid input. The default (if provided) is shown in
 * the prompt suffix and selected when the user presses Enter on an
 * empty line.
 *
 * @param message - Header text shown above the choice list
 * @param choices - List of choice labels (must be non-empty)
 * @param options - Optional default index (0-based)
 * @returns The chosen string from `choices`
 *
 * @throws {RangeError} When `choices` is empty
 *
 * @example
 * ```ts
 * const driver = await choose('Pick a driver', [
 *   'postgres',
 *   'mysql',
 *   'sqlite',
 * ], { default: 0 });
 * ```
 */
export const choose = async (
  message: string,
  choices: readonly string[],
  options: ChooseOptions = {},
): Promise<string> => {
  if (choices.length === 0) {
    throw new RangeError('choose() requires at least one choice');
  }
  // No line input available (workerd, browsers): throw rather than
  // rendering a menu nobody can answer.
  assertBuiltin(nodeReadline, 'node:readline', 'choose');
  assertBuiltin(nodeProcess, 'node:process', 'choose');
  const defaultIdx = options.default !== undefined &&
      options.default >= 0 &&
      options.default < choices.length
    ? options.default
    : undefined;

  _writeStdout(`${message}\n`);
  for (let i = 0; i < choices.length; i++) {
    _writeStdout(`  ${i + 1}. ${choices[i]}\n`);
  }

  const defaultLabel = defaultIdx !== undefined
    ? String(defaultIdx + 1)
    : undefined;
  const promptText = `Enter number (1-${choices.length})`;

  while (true) {
    const answer = await _readPlainLine(promptText, defaultLabel);
    const n = _validateChoice(answer, choices.length, defaultIdx);
    if (n !== null) return choices[n - 1]!;
    _writeStdout(
      `Invalid choice. Please enter a number between 1 and ${choices.length}.\n`,
    );
  }
};
