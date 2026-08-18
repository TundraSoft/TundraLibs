/**
 * @fileoverview `hello <name>` — greets the named user via the
 * shared Greeter singleton. A plain class: the `inject()` field
 * initializer wires it on `new`, no decorator needed.
 *
 * @module
 */

import { inject } from '../../../mod.ts';

export class HelloCommand {
  public greeter = inject('Greeter');

  public run(args: string[]): void {
    const name = args[0] ?? 'world';
    console.log(this.greeter.greet(name, false));
  }
}
