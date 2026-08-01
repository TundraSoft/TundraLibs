/**
 * @fileoverview The PACT bitmask permission engine.
 *
 * `Permissions` is the pure, storage-agnostic core of PACT's authorization.
 * It holds the base permission registry (name → BigInt bit) and an optional
 * module catalog (module → applicable permissions), and evaluates a
 * principal's grants (module → mask) against required permissions using
 * BigInt bitwise math — so the permission count is unbounded (no 31-bit JS
 * `number` ceiling).
 *
 * Exported standalone for authorization-only use; the `PACT` facade composes
 * it with tokens, groups, and login.
 *
 * @example
 * ```ts
 * const perms = new Permissions(
 *   { READ: 1n, EDIT: 2n, DELETE: 4n },
 *   { Post: ['READ', 'EDIT', 'DELETE'], Billing: ['READ'] },
 * );
 * perms.has('Post', 'EDIT', { Post: 3n });      // true  (grant is READ|EDIT)
 * perms.assert('Post', 'DELETE', { Post: 3n }); // throws PactDeniedError
 * ```
 *
 * @module
 */

import { PactDefinitionError, PactDeniedError } from './errors/mod.ts';
import type {
  PACTGrants,
  PACTModulePermissions,
  PACTPermissionBits,
  PACTPermissionRef,
} from './types/mod.ts';

/** Precomputed catalog entry for one module. */
type ModuleEntry<P extends PACTPermissionBits> = {
  /** Union mask of every permission applicable to the module. */
  mask: bigint;
  /** Applicable permission names, in declared order. */
  names: ReadonlyArray<keyof P & string>;
};

/**
 * BigInt bitmask permission engine. Construct with a permission registry and
 * an optional module catalog; evaluate grants with {@link Permissions.has}
 * and friends.
 *
 * @typeParam P - the permission registry type (name → bit).
 */
export class Permissions<P extends PACTPermissionBits = PACTPermissionBits> {
  private readonly __bits: P;
  private readonly __modules: Map<string, ModuleEntry<P>> | undefined;

  /**
   * @param bits - the permission registry (name → positive, unique BigInt bit).
   * @param modules - optional module catalog (module → applicable permissions).
   *
   * @throws {@link PactDefinitionError} when a bit is non-positive
   *   (`INVALID_PERMISSION_BIT`), two names share a bit
   *   (`DUPLICATE_PERMISSION_BIT`), or a module references a permission not in
   *   the registry (`UNKNOWN_PERMISSION`).
   */
  constructor(bits: P, modules?: PACTModulePermissions<P>) {
    // Validate the registry: each bit a positive, unique BigInt.
    const seen = new Map<bigint, string>();
    for (const [name, value] of Object.entries(bits)) {
      if (typeof value !== 'bigint' || value <= 0n) {
        throw new PactDefinitionError(
          `Permission '${name}' must map to a positive BigInt bit (got ${
            String(value)
          })`,
          { code: 'INVALID_PERMISSION_BIT', permission: name },
        );
      }
      const prior = seen.get(value);
      if (prior !== undefined) {
        throw new PactDefinitionError(
          `Permissions '${prior}' and '${name}' share bit value ${value}`,
          {
            code: 'DUPLICATE_PERMISSION_BIT',
            permission: name,
            conflictsWith: prior,
          },
        );
      }
      seen.set(value, name);
    }
    // Null-prototype registry so a permission name that collides with an
    // `Object.prototype` member ('toString', 'constructor', 'hasOwnProperty',
    // 'valueOf', '__proto__') resolves to `undefined` (→ UNKNOWN_PERMISSION)
    // instead of an inherited function — which would otherwise slip past the
    // `=== undefined` guards and poison the BigInt bit math with a raw
    // `TypeError: Cannot mix BigInt and other types`. Mirrors the null-proto
    // accumulators the grants helpers already use. [F2]
    const registry: P = Object.create(null);
    this.__bits = Object.freeze(Object.assign(registry, bits));

    // Build + validate the module catalog when provided.
    if (modules === undefined) {
      this.__modules = undefined;
    } else {
      const map = new Map<string, ModuleEntry<P>>();
      for (const [module, names] of Object.entries(modules)) {
        let mask = 0n;
        for (const name of names) {
          const bit = this.__bits[name];
          if (bit === undefined) {
            throw new PactDefinitionError(
              `Module '${module}' references unknown permission '${
                String(name)
              }'`,
              { code: 'UNKNOWN_PERMISSION', module, permission: String(name) },
            );
          }
          mask |= bit;
        }
        map.set(module, { mask, names: [...names] });
      }
      this.__modules = map;
    }
  }

  /** The permission registry (name → bit); frozen. */
  get bits(): Readonly<P> {
    return this.__bits;
  }

  /** Declared module names, or `[]` when no catalog was provided. */
  get modules(): ReadonlyArray<string> {
    return this.__modules ? [...this.__modules.keys()] : [];
  }

  /**
   * Resolve a permission reference (name or raw bit) to its BigInt bit.
   *
   * @throws {@link PactDefinitionError} (`UNKNOWN_PERMISSION`) when
   *   `permission` is a name absent from the registry.
   */
  resolve(permission: PACTPermissionRef<P>): bigint {
    if (typeof permission === 'bigint') return permission;
    const bit = this.__bits[permission];
    if (bit === undefined) {
      throw new PactDefinitionError(
        `Unknown permission '${String(permission)}'`,
        { code: 'UNKNOWN_PERMISSION', permission: String(permission) },
      );
    }
    return bit;
  }

  /**
   * True when `grants` include `permission` on `module`.
   *
   * @throws {@link PactDefinitionError} when a module catalog is configured
   *   and `module` is unknown (`UNKNOWN_MODULE`) or `permission` is not
   *   applicable to it (`PERMISSION_NOT_IN_MODULE`) / not in the registry
   *   (`UNKNOWN_PERMISSION`).
   */
  has(
    module: string,
    permission: PACTPermissionRef<P>,
    grants: PACTGrants,
  ): boolean {
    const bit = this.__requireApplicable(module, permission);
    if (bit === 0n) return true; // vacuous — nothing required
    // `grants` is a caller-supplied plain object; read it own-property-safe so
    // a module named 'constructor'/'toString'/'__proto__'/… reads an actual
    // grant (or nothing) rather than an inherited `Object.prototype` member,
    // which would corrupt the bit math below with a `TypeError`. [F2]
    const held = Object.hasOwn(grants, module) ? grants[module] ?? 0n : 0n;
    return (held & bit) === bit;
  }

  /** True when `grants` include *any* of `permissions` on `module`. */
  any(
    module: string,
    permissions: ReadonlyArray<PACTPermissionRef<P>>,
    grants: PACTGrants,
  ): boolean {
    return permissions.some((p) => this.has(module, p, grants));
  }

  /** True when `grants` include *all* of `permissions` on `module`. */
  all(
    module: string,
    permissions: ReadonlyArray<PACTPermissionRef<P>>,
    grants: PACTGrants,
  ): boolean {
    return permissions.every((p) => this.has(module, p, grants));
  }

  /**
   * Assert `grants` include `permission` on `module`.
   *
   * @throws {@link PactDeniedError} (`PERMISSION_DENIED`) when they do not.
   * @throws {@link PactDefinitionError} on the catalog-validation conditions
   *   documented on {@link Permissions.has}.
   */
  assert(
    module: string,
    permission: PACTPermissionRef<P>,
    grants: PACTGrants,
  ): void {
    if (!this.has(module, permission, grants)) {
      throw new PactDeniedError(module, this.__label(permission));
    }
  }

  /** Return a new mask with `permissions` added (bitwise OR). */
  grant(mask: bigint, ...permissions: PACTPermissionRef<P>[]): bigint {
    return permissions.reduce<bigint>((m, p) => m | this.resolve(p), mask);
  }

  /** Return a new mask with `permissions` removed (bitwise AND-NOT). */
  revoke(mask: bigint, ...permissions: PACTPermissionRef<P>[]): bigint {
    return permissions.reduce<bigint>((m, p) => m & ~this.resolve(p), mask);
  }

  /** Bits added (in `b`, not `a`) and removed (in `a`, not `b`). */
  diff(a: bigint, b: bigint): { added: bigint; removed: bigint } {
    return { added: b & ~a, removed: a & ~b };
  }

  /** Decompose a `module` mask into the applicable permission names it holds. */
  toNames(module: string, mask: bigint): Array<keyof P & string> {
    return this.__namesFor(module).filter((name) => {
      const bit = this.__bits[name]!;
      return (mask & bit) === bit;
    });
  }

  /** Combine permission `names` into a mask (validated against `module`). */
  toMask(module: string, names: ReadonlyArray<keyof P & string>): bigint {
    return names.reduce(
      (m, name) => m | this.__requireApplicable(module, name),
      0n,
    );
  }

  // ── internals ──────────────────────────────────────────────────────

  /** Resolve, and verify applicability to `module` when a catalog exists. */
  private __requireApplicable(
    module: string,
    permission: PACTPermissionRef<P>,
  ): bigint {
    const bit = this.resolve(permission);
    if (this.__modules !== undefined) {
      const entry = this.__modules.get(module);
      if (entry === undefined) {
        throw new PactDefinitionError(`Unknown module '${module}'`, {
          code: 'UNKNOWN_MODULE',
          module,
        });
      }
      if ((entry.mask & bit) !== bit) {
        throw new PactDefinitionError(
          `Permission '${
            this.__label(permission)
          }' is not applicable to module '${module}'`,
          {
            code: 'PERMISSION_NOT_IN_MODULE',
            module,
            permission: this.__label(permission),
          },
        );
      }
    }
    return bit;
  }

  /** Applicable names for a module (catalog) or all registry names (no catalog). */
  private __namesFor(module: string): ReadonlyArray<keyof P & string> {
    if (this.__modules === undefined) {
      return Object.keys(this.__bits) as Array<keyof P & string>;
    }
    const entry = this.__modules.get(module);
    if (entry === undefined) {
      throw new PactDefinitionError(`Unknown module '${module}'`, {
        code: 'UNKNOWN_MODULE',
        module,
      });
    }
    return entry.names;
  }

  /** Human label for a permission ref (name, or `0b…` for a raw bit). */
  private __label(permission: PACTPermissionRef<P>): string {
    return typeof permission === 'bigint'
      ? `0b${permission.toString(2)}`
      : String(permission);
  }
}
