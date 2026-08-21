/**
 * In-memory user store — a plain `@Vial` service: constructed by doctor
 * on first `inject()`, shared by every module that asks for it.
 * @module
 */
import { Vial } from '@tundralibs/doctor';
import { ulid } from '@tundralibs/id';

export type Role = 'admin' | 'editor' | 'member';
export type User = { id: string; email: string; role: Role };

@Vial('SINGLETON')
export class UserStore {
  private readonly __rows = new Map<string, User>();

  create(email: string, role: Role = 'member'): User {
    const user = { id: ulid(), email, role };
    this.__rows.set(user.id, user);
    return user;
  }
  get(id: string): User | undefined {
    return this.__rows.get(id);
  }
  exists(id: string): boolean {
    return this.__rows.has(id);
  }
  setRole(id: string, role: Role): User | undefined {
    const user = this.__rows.get(id);
    if (user !== undefined) user.role = role;
    return user;
  }
}
