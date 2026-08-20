/**
 * @fileoverview Benchmarks for the CLI argument parser (`argv`). It
 * tokenizes flags (`--name=value`, `--name value`, `-x`), coerces
 * scalar values, and collects positionals — a real parse loop worth
 * measuring across a few argument shapes. `argv` takes its tokens as an
 * argument, so the benched work excludes any process-level lookup.
 *
 * @module
 */

import { bench } from '../bench.ts';
import { argv } from './args.ts';

// A realistic mixed command line: flags, a `=value`, a short flag with
// a value, and positionals.
const TYPICAL = [
  '--verbose',
  'input.txt',
  '--port',
  '8080',
  '-x',
  'output/',
  '--mode=fast',
  '--retries=3',
];

// Flag-heavy: exercises the `=value` split + scalar coercion repeatedly.
const FLAG_HEAVY = Array.from({ length: 40 }, (_, i) => `--flag${i}=${i}`);

// Positional-heavy: the cheap fall-through path.
const POSITIONAL_HEAVY = Array.from({ length: 40 }, (_, i) => `file-${i}.txt`);

bench('argv - typical mixed line', () => argv(TYPICAL));
bench('argv - flag-heavy (=value + coercion)', () => argv(FLAG_HEAVY));
bench('argv - positional-heavy', () => argv(POSITIONAL_HEAVY));
