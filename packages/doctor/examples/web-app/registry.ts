/**
 * @fileoverview Registers vials whose constructors need arguments —
 * WebConfig in this example — and carries the {@link VialRegistry}
 * augmentation that types every `inject('...')` token in the example
 * (the role `@tundralibs/doctor/build` plays in a real project).
 * Pure-decorator vials register themselves on import.
 *
 * @module
 */

import { Doctor } from '../../mod.ts';
import { WebConfig } from './Config.ts';
// Side-effect imports: @Vial registers at class definition, so a vial
// only exists once its module has been loaded. Forget one here and
// its `inject()` consumers throw UnregisteredVialError at `new`.
import './Logger.ts';
import './Database.ts';
import './UserRepository.ts';

declare module '../../mod.ts' {
  interface VialRegistry {
    WebConfig: import('./Config.ts').WebConfig;
    WebLogger: import('./Logger.ts').WebLogger;
    Database: import('./Database.ts').Database;
    UserRepository: import('./UserRepository.ts').UserRepository;
  }
}

const APP_NAME = 'demo-api';
const DB_URL = 'postgres://localhost:5432/demo';

if (!Doctor.knows(WebConfig)) {
  Doctor.prescribe(WebConfig, {
    mode: 'SINGLETON',
    factory: () => new WebConfig(APP_NAME, DB_URL),
  });
}
