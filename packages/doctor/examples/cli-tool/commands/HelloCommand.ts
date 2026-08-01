/**
 * @fileoverview `hello <name>` — greets the named user via the
 * shared Greeter singleton. Uses `@Inoculate()` (no scope) because
 * the CLI is one-shot and all dependencies are singletons.
 *
 * @module
 */

import { Dose, Inoculate } from '../../../mod.ts';
import { Greeter } from '../Greeter.ts';

@Inoculate()
export class HelloCommand {
  @Dose()
  public greeter!: Greeter;

  public run(args: string[]): void {
    const name = args[0] ?? 'world';
    console.log(this.greeter.greet(name, false));
  }
}
