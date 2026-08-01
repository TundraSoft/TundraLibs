/**
 * @fileoverview Registers vials whose constructors need arguments —
 * Config in this example. Pure-decorator vials (Logger, Database,
 * UserRepository) register themselves on import.
 *
 * @module
 */

import { Doctor } from '../../mod.ts';
import { Config } from './Config.ts';

const APP_NAME = 'demo-api';
const DB_URL = 'postgres://localhost:5432/demo';

if (!Doctor.knows(Config)) {
  Doctor.prescribe(Config, {
    mode: 'SINGLETON',
    factory: () => new Config(APP_NAME, DB_URL),
  });
}
