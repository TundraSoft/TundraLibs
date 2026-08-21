/**
 * Test setup for the example: doctor singletons are process-wide, so
 * each test re-registers the stores (fresh state) and the doctor-held
 * module (`Audit`) — `revoke` + `prescribe`, never `Doctor.reset()`,
 * which would also wipe every `@Vial` registration made at import time.
 * @module
 */
import { Doctor } from '@tundralibs/doctor';
import { Audit } from './modules/Audit.ts';
import { Mailer } from './services/Mailer.ts';
import { PostStore } from './services/PostStore.ts';
import { UserStore } from './services/UserStore.ts';

/** Fresh services + a fresh Audit singleton; returns the mailer to assert on. */
export function freshServices(): { mailer: Mailer } {
  for (const cls of [UserStore, PostStore, Audit]) {
    Doctor.revoke(cls);
    Doctor.prescribe(cls, 'SINGLETON');
  }
  Doctor.revoke(Mailer);
  const mailer = new Mailer();
  Doctor.stock(Mailer, mailer); // a ready instance under the class token
  return { mailer };
}

/** Quiet runtime options for tests. */
export const TEST = { name: 'example-test', logger: { handlers: [] } };
