/**
 * Users — registration (emits), plus two guarded methods that only enforce
 * their guard when INVOKED (a direct call is just a call).
 * @module
 */
import { RapidError } from '../../../errors/mod.ts';
import { payload, Use } from '../../mod.ts';
import { AppModule } from '../AppModule.ts';
import { requireAuth, requireRole } from '../middleware.ts';
import type { Role, User } from '../services/UserStore.ts';

export class Users extends AppModule {
  readonly name = 'Users';
  readonly namespace = 'users';
  readonly events = {
    UserRegistered: payload<{ id: string; email: string }>(),
  };

  /** Fire-and-forget: the caller doesn't wait for welcome mail / audit. */
  register(email: string): User {
    const user = this.users.create(email);
    this.emit('UserRegistered', { id: user.id, email });
    this.log.info('user registered', { id: user.id });
    return user;
  }

  @Use(requireAuth)
  find(id: string): User {
    const user = this.users.get(id);
    if (user === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return user;
  }

  @Use(requireRole('admin'))
  promote(id: string, role: Role): User {
    const user = this.users.setRole(id, role);
    if (user === undefined) {
      throw new RapidError('RAPID_NOT_FOUND', { details: { id } });
    }
    return user;
  }
}
