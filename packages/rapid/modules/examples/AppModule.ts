/**
 * The app's standard base: rAPId's `RapidModule` chassis (identity, log,
 * config, emit, invoke) plus THIS app's shared services, injected once
 * here so no module re-declares them. Abstract — NOT exported from the
 * modules barrel (an abstract base in the barrel fails the boot, by
 * design).
 * @module
 */
import { inject } from '@tundralibs/doctor';
import { RapidModule } from '../mod.ts';
import { Mailer } from './services/Mailer.ts';
import { PostStore } from './services/PostStore.ts';
import { UserStore } from './services/UserStore.ts';

export abstract class AppModule extends RapidModule {
  protected readonly users = inject(UserStore);
  protected readonly posts = inject(PostStore);
  protected readonly mailer = inject(Mailer);
}
