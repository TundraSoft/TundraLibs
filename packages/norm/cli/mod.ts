/**
 * @fileoverview The norm CLI — `norm <command>`. Run remotely:
 * `deno run -A jsr:@tundralibs/norm/cli init`. Cross-runtime via compat.
 *
 * Commands: `init` (scaffold a norm project in the current directory, or
 * add norm to one that already exists), `upgrade` (bump `@tundralibs/*`
 * dependencies), `ping` (connectivity smoke test against Norm.yaml).
 * @module
 */
import { argv } from '@tundralibs/compat/cli';
import type { ParsedArgs } from '@tundralibs/compat/cli';
import { exit } from '@tundralibs/compat/runtime';
import { initCommand } from './commands/init.ts';
import { pingCommand } from './commands/ping.ts';
import { upgradeCommand } from './commands/upgrade.ts';

const HELP = `norm <command>

  init [--yes]
        scaffold a norm project in the current directory, or add norm to
        one that already exists; no dialect/runtime prompt — the dialect
        lives in configs/Norm.yaml (data, never code), and both deno.json
        and package.json are written/merged unconditionally
  upgrade [--dir .]
        bump @tundralibs/* dependencies to their latest release
  ping [dir]
        open the connection described by configs/Norm.yaml and report
        success/failure; exit 0/1 — a connectivity smoke test, not a query
`;

/** Parse args and dispatch. Returns the exit code. */
export function run(args: ParsedArgs = argv()): Promise<number> {
  const cmd = args._[0] as string | undefined;
  const rest: ParsedArgs = { ...args, _: args._.slice(1) };
  switch (cmd) {
    case 'init':
      return initCommand(rest);
    case 'upgrade':
      return upgradeCommand((rest.dir as string | undefined) ?? '.');
    case 'ping':
      return pingCommand((rest._[0] as string | undefined) ?? '.');
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP);
      return Promise.resolve(0);
    default:
      console.error(`unknown command: ${cmd}\n\n${HELP}`);
      return Promise.resolve(1);
  }
}

if (import.meta.main) {
  exit(await run());
}
