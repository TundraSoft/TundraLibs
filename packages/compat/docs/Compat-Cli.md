# Compat-CLI

Cross-runtime CLI helpers — argument access, terminal info, line-based
interactive prompts, and in-place display widgets.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [API Reference](#api-reference)
  - [Argument access](#argument-access)
  - [Terminal info](#terminal-info)
  - [Interactive prompts](#interactive-prompts)
  - [Progress bar](#progress-bar)
  - [Spinner](#spinner)
- [Examples](#examples)

## Overview

The CLI module bundles the helpers commonly needed when building
command-line tools: pulling and parsing CLI args, asking the user
questions, and rendering progress/spinner UI. Everything lives behind
the single `@tundralibs/compat/cli` entry point but is split into
focused submodules under the hood.

### Features

| Feature             | Bun | Deno | Node.js |
| ------------------- | --- | ---- | ------- |
| `args()` raw tokens | ✅  | ✅   | ✅      |
| `argv()` parser     | ✅  | ✅   | ✅      |
| `isTTY()`           | ✅  | ✅   | ✅      |
| `consoleSize()`     | ✅  | ✅   | ✅      |
| `prompt()` plain    | ✅  | ✅   | ✅      |
| `prompt()` password | ✅  | ✅   | ✅      |
| `choose()`          | ✅  | ✅   | ✅      |
| `ProgressBar`       | ✅  | ✅   | ✅      |
| `Spinner`           | ✅  | ✅   | ✅      |

## Installation

**Deno:**

```bash
deno add @tundralibs/compat
```

**Bun:**

```bash
bunx jsr add @tundralibs/compat
```

**Node.js:**

```bash
npx jsr add @tundralibs/compat
```

## API Reference

### Argument access

#### `args()`

Returns the user-supplied CLI tokens. Node's `argv[0]` (the runtime
path) and `argv[1]` (the script path) are stripped automatically.

```typescript
function args(): string[];
```

**Example:**

```typescript
import { args } from '@tundralibs/compat/cli';

// Invoked as: deno run script.ts --port 8080 input.txt
args(); // => ['--port', '8080', 'input.txt']
```

#### `argv()`

Parses CLI tokens into a structured object. Standard tier — covers
the shapes most scripts need without the surface area of a full
parser like yargs/cliffy.

```typescript
type ArgValue = string | number | boolean;

type ParsedArgs = {
  _: string[]; // positional args
  [key: string]: ArgValue | ArgValue[]; // flag values; arrays for repeats
};

function argv(input?: readonly string[]): ParsedArgs;
```

**Supported shapes:**

| Input                          | Result                                   |
| ------------------------------ | ---------------------------------------- |
| `['--name=value']`             | `{ _: [], name: 'value' }`               |
| `['--name', 'value']`          | `{ _: [], name: 'value' }`               |
| `['--flag']`                   | `{ _: [], flag: true }`                  |
| `['-x']`                       | `{ _: [], x: true }`                     |
| `['-x', 'foo']`                | `{ _: [], x: 'foo' }`                    |
| `['--port=8080']`              | `{ _: [], port: 8080 }` (numeric coerce) |
| `['--id=abc123']`              | `{ _: [], id: 'abc123' }` (no coerce)    |
| `['--inc', 'a', '--inc', 'b']` | `{ _: [], inc: ['a', 'b'] }` (repeated)  |
| `['foo', 'bar']`               | `{ _: ['foo', 'bar'] }` (positional)     |

**Not supported (out of scope):**

- Combined short flags (`-xyz`)
- `--no-flag` boolean negation
- `--` end-of-flags marker
- Negative numbers as positional (`-5` → `{ '5': true }`; pass via
  `--key=-5` instead)

If you need any of those, reach for [yargs], [commander], or [cliffy].

[yargs]: https://github.com/yargs/yargs
[commander]: https://github.com/tj/commander.js
[cliffy]: https://cliffy.io/

**Example:**

```typescript
import { argv } from '@tundralibs/compat/cli';

const opts = argv();
const port = typeof opts.port === 'number' ? opts.port : 8080;
const verbose = opts.verbose === true;
const includes = Array.isArray(opts.inc)
  ? opts.inc
  : opts.inc
  ? [opts.inc]
  : [];
const inputs = opts._;
```

### Terminal info

#### `isTTY()`

Reports whether one of the standard streams is connected to a
terminal. Use it to switch between rich output (colors, progress
bars) and plain output (log files, CI pipelines).

```typescript
function isTTY(stream?: 'stdin' | 'stdout' | 'stderr'): boolean;
```

Defaults to `'stdout'`. On unknown runtimes always returns `false`.

**Example:**

```typescript
import { isTTY } from '@tundralibs/compat/cli';

if (isTTY()) {
  // interactive output
} else {
  console.log('progress: 50%');
}
```

#### `consoleSize()`

Terminal dimensions in characters. Falls back to `{ columns: 80, rows: 24 }`
when no terminal is attached.

```typescript
function consoleSize(): { columns: number; rows: number };
```

**Example:**

```typescript
import { consoleSize } from '@tundralibs/compat/cli';

const { columns } = consoleSize();
console.log('-'.repeat(columns));
```

### Interactive prompts

#### `prompt()`

Reads a single line from the user. With `password: true` it switches
stdin to raw mode and masks input with `*`; with `password: 'silent'`
nothing is echoed (sudo-style). Falls back to a plain read when
stdin isn't a TTY (piped input).

```typescript
type PromptOptions = {
  default?: string;
  password?: boolean | 'masked' | 'silent';
};

function prompt(message: string, options?: PromptOptions): Promise<string>;
```

**Example:**

```typescript
import { prompt } from '@tundralibs/compat/cli';

const port = await prompt('Port', { default: '8080' });
const password = await prompt('Password', { password: true });
```

#### `choose()`

Numbered selection menu. Renders a list, asks for a number, validates,
re-prompts on invalid input. Pressing Enter on an empty line picks
the default if one was provided.

```typescript
type ChooseOptions = {
  default?: number; // 0-based index of the default choice
};

function choose(
  message: string,
  choices: readonly string[],
  options?: ChooseOptions,
): Promise<string>;
```

Throws `RangeError` if `choices` is empty.

**Example:**

```typescript
import { choose } from '@tundralibs/compat/cli';

const driver = await choose('Pick a driver', [
  'postgres',
  'mysql',
  'sqlite',
], { default: 0 });
```

### Progress bar

In TTY mode renders an in-place updating bar with carriage-return.
In non-TTY mode (CI, redirected output) emits one line per percent
change so logs stay readable. Rate-limits TTY renders to ~60fps so
tight update loops don't flood the terminal.

```typescript
type WritableLike = { write(chunk: string): unknown };

type ProgressBarOptions = {
  total: number; // positive finite number
  label?: string;
  width?: number; // default 40
  fillChar?: string; // default '█'
  emptyChar?: string; // default '░'
  stream?: WritableLike; // default process.stdout
  tty?: boolean; // default isTTY('stdout')
};

class ProgressBar {
  constructor(options: ProgressBarOptions);
  readonly value: number;
  readonly total: number;
  update(value: number, label?: string): void; // clamps to [0, total]
  increment(by?: number): void; // default 1
  complete(label?: string): void; // forces final render + newline, then inert
  stop(): void; // abandon current state, emit newline
}
```

**Example:**

```typescript
import { ProgressBar } from '@tundralibs/compat/cli';

const bar = new ProgressBar({ total: items.length, label: 'Indexing' });
for (const item of items) {
  await process(item);
  bar.increment();
}
bar.complete('Done');
```

### Spinner

In TTY mode animates braille frames in place. In non-TTY mode emits
a single "starting" line on `start()` and a final line on
`succeed`/`fail`/`stop` — no animation in non-interactive output.

```typescript
const SPINNER_FRAMES_BRAILLE: readonly string[];
//   ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
const SPINNER_FRAMES_ASCII: readonly string[];
//   ['|','/','-','\\']

type SpinnerOptions = {
  label?: string;
  frames?: readonly string[]; // default SPINNER_FRAMES_BRAILLE
  intervalMs?: number; // default 80
  stream?: WritableLike;
  tty?: boolean;
};

class Spinner {
  constructor(options?: SpinnerOptions);
  readonly running: boolean;
  start(label?: string): void;
  tick(): void; // advance one frame manually (the timer drives this)
  setLabel(label: string): void;
  succeed(label?: string): void; // ✓ + label
  fail(label?: string): void; // ✗ + label
  stop(): void; // clears the line, no symbol
}
```

For terminals that don't render Unicode well (legacy Windows cmd,
genuinely dumb terminals), opt into ASCII frames:

```typescript
import { Spinner, SPINNER_FRAMES_ASCII } from '@tundralibs/compat/cli';

const spin = new Spinner({ frames: SPINNER_FRAMES_ASCII });
```

**No auto-detection.** Picking between braille and ASCII based on
terminal heuristics (TERM, WT_SESSION, locale, …) tends to be wrong
in practice — opt-in keeps behavior predictable.

**Example:**

```typescript
import { Spinner } from '@tundralibs/compat/cli';

const spin = new Spinner({ label: 'Connecting' });
spin.start();
try {
  await connect();
  spin.succeed('Connected');
} catch (err) {
  spin.fail(`Failed: ${err.message}`);
}
```

## Examples

### Wiring args + prompt + progress

```typescript
import { argv, isTTY, ProgressBar, prompt } from '@tundralibs/compat/cli';

const opts = argv();
const concurrency = typeof opts.concurrency === 'number' ? opts.concurrency : 4;

const dbHost = await prompt('Database host', {
  default: typeof opts.host === 'string' ? opts.host : 'localhost',
});

const items = await loadWork(dbHost);
const bar = new ProgressBar({
  total: items.length,
  label: 'Migrating',
  tty: isTTY(),
});

await Promise.all(
  items.map((item) => process(item).then(() => bar.increment())),
);
bar.complete('Done');
```

### Falling back to non-interactive output

`isTTY()` lets the same binary work in a developer terminal _and_ in
CI without changing flags:

```typescript
import { isTTY, Spinner } from '@tundralibs/compat/cli';

if (isTTY()) {
  const spin = new Spinner({ label: 'Building' });
  spin.start();
  await build();
  spin.succeed('Built');
} else {
  console.log('Building...');
  await build();
  console.log('Done');
}
```

The `ProgressBar` and `Spinner` widgets already auto-degrade in
non-TTY mode — the explicit branch above is only useful when you
want different _content_, not just a different render.
