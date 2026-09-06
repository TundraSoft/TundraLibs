import type { PactPrincipal, PermissionBits } from './types/mod.ts';
import { PactError } from './errors/mod.ts';

/**
 * The evaluation capability a {@link BoundPrincipal} closes over — only
 * `Pact.__bind` constructs one, which is what makes bound principals
 * unforgeable: there is no code path from userland data to a working
 * kernel.
 */
export type BoundPrincipalKernel<B extends PermissionBits, M extends string> = {
  /** Mask-level check against the pact definition (clamp + evaluate). */
  readonly evaluate: (
    module: M,
    permission: keyof B,
    grants: Readonly<Partial<Record<M, bigint>>> | null,
  ) => boolean;
  /** Fresh resolution by id (cache → hooks, owner gate included). */
  readonly resolve: (id: string) => Promise<PactPrincipal<M> | null>;
  /** The pact's global revocation epoch — a bump staleness-marks every
   * outstanding bound principal at once. */
  readonly epoch: () => number;
  /** How long minted grants stay authoritative before re-resolution. */
  readonly freshnessMs: number;
};

// Kernels live OFF the instance so they can never be extracted from,
// cloned with, or serialized alongside one: a structured-cloned bound
// principal arrives as plain data with no methods and no kernel — the
// capability cannot cross a boundary, only the id can.
const KERNELS = new WeakMap<object, unknown>();

/**
 * A principal bound to the pact that resolved it: the plain
 * {@link PactPrincipal} data plus `hasPermission`/`assert` that evaluate
 * against grants pact keeps fresh. Minted ONLY by `authenticate` and
 * `Pact.principalOf` — a proof with a shelf life:
 *
 * - fresh (within the freshness budget, epoch unchanged) → pure bit
 *   math, zero I/O;
 * - stale (budget exceeded, or a revocation API bumped the epoch) →
 *   transparently re-resolves by its own id and swaps its grants, so a
 *   long-held reference (a WebSocket connection, a job) self-heals at
 *   one resolution per window and sees revocation at its next check;
 * - resolution returning null (deleted, inactive, owner suspended) →
 *   empty grants for one window, then retried — fail-closed, but a
 *   reactivated actor recovers.
 */
export class BoundPrincipal<B extends PermissionBits, M extends string> {
  public readonly kind: 'USER' | 'APIKEY';
  public readonly id: string;
  /** Owning user, when the principal is a key that belongs to one. */
  public readonly userId?: string;
  public readonly metadata?: Readonly<Record<string, unknown>>;

  /** The currently-held effective masks (frozen; swapped wholesale on
   * refresh — mutation attempts throw in strict mode). */
  public get grants(): Readonly<Partial<Record<M, bigint>>> {
    return this.__grants;
  }

  private __grants: Readonly<Partial<Record<M, bigint>>>;
  private __mintedAt: number;
  private __epoch: number;

  constructor(
    source: PactPrincipal<M>,
    kernel: BoundPrincipalKernel<B, M>,
  ) {
    this.kind = source.kind;
    this.id = source.id;
    if (source.kind === 'APIKEY') this.userId = source.userId;
    this.metadata = source.metadata;
    this.__grants = Object.freeze({ ...source.grants });
    this.__mintedAt = Date.now();
    this.__epoch = kernel.epoch();
    KERNELS.set(this, kernel);
  }

  /**
   * Does this principal hold `permission` in `module`? Free bit math
   * while fresh; re-resolves through the minting pact when stale.
   *
   * @throws {PactError} `UNKNOWN_MODULE` / `UNKNOWN_PERMISSION` /
   *   `PERMISSION_NOT_IN_MODULE` on definition misuse — the grants
   *   verdict itself is always a boolean.
   */
  public async hasPermission(
    module: M,
    permission: keyof B,
  ): Promise<boolean> {
    const kernel = KERNELS.get(this) as
      | BoundPrincipalKernel<B, M>
      | undefined;
    // No kernel means this object was never minted (a prototype-grafted
    // forgery, or data that crossed a process boundary) — fail closed.
    if (kernel === undefined) return false;
    await this.__refreshIfStale(kernel);
    return kernel.evaluate(module, permission, this.__grants);
  }

  /**
   * Like {@link hasPermission}, but throws when not granted.
   *
   * @throws {PactError} `PERMISSION_DENIED` when the permission is not
   *   held; definition-misuse codes as in {@link hasPermission}.
   */
  public async assert(module: M, permission: keyof B): Promise<void> {
    if (!await this.hasPermission(module, permission)) {
      throw new PactError('PERMISSION_DENIED', {
        kind: this.kind,
        principal: this.id,
        permission: String(permission),
        module,
      });
    }
  }

  private async __refreshIfStale(
    kernel: BoundPrincipalKernel<B, M>,
  ): Promise<void> {
    if (
      this.__epoch === kernel.epoch() &&
      Date.now() - this.__mintedAt < kernel.freshnessMs
    ) return;
    const resolved = await kernel.resolve(this.id);
    this.__grants = Object.freeze(
      resolved === null ? {} : { ...resolved.grants },
    );
    // Re-stamp even on null so a revoked actor costs one resolution per
    // window (not per check) and a reactivated one recovers next window.
    this.__mintedAt = Date.now();
    this.__epoch = kernel.epoch();
  }
}
