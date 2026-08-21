/**
 * Invoke-time guards. They read the principal off `ctx.state` — which is
 * the CALLER's state when reached through `invoke`, or the seed when a
 * test/script invokes at top level. A plain method call never runs them:
 * that is the point of `invoke` vs "just call it".
 * @module
 */
import { RapidError } from '../../errors/mod.ts';
import type { RapidModuleInvokeMiddleware } from '../mod.ts';
import type { Role } from './services/UserStore.ts';

export type Principal = { id: string; role: Role };

const principalOf = (state: Record<string, unknown>): Principal | undefined =>
  state.principal as Principal | undefined;

/** 401 unless a principal is present. */
export const requireAuth: RapidModuleInvokeMiddleware = (ctx, next) => {
  if (principalOf(ctx.state) === undefined) {
    throw new RapidError('RAPID_UNAUTHENTICATED');
  }
  return next();
};

/** 401 without a principal, 403 without the role. */
export const requireRole =
  (role: Role): RapidModuleInvokeMiddleware => (ctx, next) => {
    const principal = principalOf(ctx.state);
    if (principal === undefined) throw new RapidError('RAPID_UNAUTHENTICATED');
    if (principal.role !== role) {
      throw new RapidError('RAPID_ACCESS_DENIED', {
        details: { required: role, actual: principal.role },
      });
    }
    return next();
  };
