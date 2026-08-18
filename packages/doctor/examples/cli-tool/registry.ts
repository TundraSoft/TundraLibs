/**
 * @fileoverview Registers vials whose constructors need arguments —
 * CliConfig in this example — and carries the {@link VialRegistry}
 * augmentation that types every `inject('...')` token in the example
 * (the role `@tundralibs/doctor/build` plays in a real project).
 * Pure-decorator vials (CliLogger, Greeter) register themselves on
 * import.
 *
 * @module
 */

import { Doctor } from '../../mod.ts';
import { CliConfig } from './Config.ts';
// Side-effect imports: @Vial registers at class definition, so a vial
// only exists once its module has been loaded. Forget one here and
// its `inject()` consumers throw UnregisteredVialError at `new`.
import './Logger.ts';
import './Greeter.ts';

declare module '../../mod.ts' {
  interface VialRegistry {
    CliConfig: import('./Config.ts').CliConfig;
    CliLogger: import('./Logger.ts').CliLogger;
    Greeter: import('./Greeter.ts').Greeter;
  }
}

const APP_NAME = 'greeter-cli';
const VERSION = '1.0.0';

if (!Doctor.knows(CliConfig)) {
  Doctor.prescribe(CliConfig, {
    mode: 'SINGLETON',
    factory: () => new CliConfig(APP_NAME, VERSION),
  });
}
