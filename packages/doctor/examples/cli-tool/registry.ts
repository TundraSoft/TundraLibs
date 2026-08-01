/**
 * @fileoverview Registers vials whose constructors need arguments —
 * Config in this example. Pure-decorator vials (Logger, Greeter)
 * register themselves on import.
 *
 * @module
 */

import { Doctor } from '../../mod.ts';
import { Config } from './Config.ts';

const APP_NAME = 'greeter-cli';
const VERSION = '1.0.0';

if (!Doctor.knows(Config)) {
  Doctor.prescribe(Config, {
    mode: 'SINGLETON',
    factory: () => new Config(APP_NAME, VERSION),
  });
}
