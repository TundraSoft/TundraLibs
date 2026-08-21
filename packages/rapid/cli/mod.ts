/**
 * @fileoverview The rАPId CLI — `rapid <command>`. Run remotely:
 * `deno run -A jsr:@tundralibs/rapid/cli init`. Cross-runtime via compat.
 *
 * Commands: `init` (scaffold), `upgrade` (bump @tundralibs/* versions),
 * `modules` (regenerate the modules barrel), `health` (ping a running app).
 *
 * @module
 */
import { argv } from '@tundralibs/compat/cli';
import type { ParsedArgs } from '@tundralibs/compat/cli';
import { exit } from '@tundralibs/compat/runtime';
import { initCommand } from './commands/init.ts';
import { upgradeCommand } from './commands/upgrade.ts';
import { modulesCommand } from './commands/modules.ts';
import { healthCommand } from './commands/health.ts';

const HELP = `rapid <command>

  init [name] [--module] [--norm] [--docker] [--git] [--runtime deno|bun|node] [--yes]
        scaffold a new project (interactive unless --yes)
  upgrade [--dir .]
        bump @tundralibs/* dependencies to their latest release
  modules [dir] [--check]
        (re)generate the modules barrel (dir defaults to ./modules)
  health [url] [--path /health]
        hit a running app's health path; exit 0 on 2xx
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
    case 'modules':
      return modulesCommand((rest._[0] as string | undefined) ?? './modules', {
        check: rest.check === true,
      });
    case 'health':
      return healthCommand(
        (rest._[0] as string | undefined) ?? 'http://localhost:3000',
        { path: rest.path as string | undefined },
      );
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
