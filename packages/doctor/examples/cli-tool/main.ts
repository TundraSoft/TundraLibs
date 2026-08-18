/**
 * @fileoverview One-shot CLI dispatcher. Parses argv, picks a
 * command, and `new`s it — the command's `inject()` field
 * initializers wire its dependencies during construction.
 *
 * Run with:
 *
 * ```bash
 * deno run packages/doctor/examples/cli-tool/main.ts hello Alice
 * deno run packages/doctor/examples/cli-tool/main.ts stats
 * ```
 *
 * @module
 */

import './registry.ts';

import { HelloCommand } from './commands/HelloCommand.ts';
import { StatsCommand } from './commands/StatsCommand.ts';

const [cmd, ...rest] = Deno.args.length ? Deno.args : ['hello', 'doctor'];

switch (cmd) {
  case 'hello':
    new HelloCommand().run(rest);
    break;
  case 'stats':
    new StatsCommand().run();
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    console.error('Usage: cli-tool {hello <name> | stats}');
    Deno.exit(1);
}
