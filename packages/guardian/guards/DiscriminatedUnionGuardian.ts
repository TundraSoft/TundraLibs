/**
 * @fileoverview {@link DiscriminatedUnionGuardian} — O(1) dispatch over
 * a tagged union of object schemas. Each branch declares its
 * discriminator value via `Guardian.literal(...)` (or
 * `Guardian.enum([value])`); construction builds a lookup map so
 * parse-time validation is a single map read + delegation rather
 * than the O(N) try-each of `Guardian.oneOf`.
 *
 * @module
 */

import { type AsyncProbeTarget, BaseGuardian } from '../BaseGuardian.ts';
import { GuardianError } from '../errors/Base.ts';
import type { GuardianMetaData, GuardianTransform } from '../types/mod.ts';
import { EnumGuardian } from './EnumGuardian.ts';
import { ObjectGuardian } from './ObjectGuardian.ts';

/**
 * Extract the output type from a tuple of ObjectGuardians by walking
 * each position. The mapped+indexed form distributes inference more
 * reliably than `T[number] extends ...` when the constraint uses
 * `ObjectGuardian<any>`.
 *
 * @internal
 */
type UnionOf<T extends readonly unknown[]> = {
  // deno-lint-ignore no-explicit-any
  [K in keyof T]: T[K] extends ObjectGuardian<infer U, any> ? U : never;
}[number];

/**
 * O(1) dispatch over a discriminated union of object schemas. The
 * discriminator field on each branch must be an {@link EnumGuardian}
 * (most commonly via {@link Guardian.literal}). Branches may match
 * multiple discriminator values (multi-value aliases — `'square'` and
 * `'rect'` routing to the same validator), but two branches sharing
 * the same discriminator value is a construction-time error.
 *
 * @template K - The discriminator field name.
 * @template T - Tuple of branch object guardians.
 *
 * @example
 * ```ts
 * const Shape = Guardian.discriminatedUnion('kind', [
 *   Guardian.object({
 *     kind: Guardian.literal('circle'),
 *     radius: Guardian.number(),
 *   }),
 *   Guardian.object({
 *     kind: Guardian.literal('square'),
 *     side: Guardian.number(),
 *   }),
 * ]);
 *
 * const out = Shape.parse({ kind: 'circle', radius: 5 });
 * // out is { kind: 'circle'; radius: number } | { kind: 'square'; side: number }
 *
 * if (out.kind === 'circle') out.radius;  // narrows correctly
 * ```
 */
export class DiscriminatedUnionGuardian<
  K extends string,
  T extends // deno-lint-ignore no-explicit-any
  readonly ObjectGuardian<any>[],
> extends BaseGuardian<UnionOf<T>> {
  protected override readonly _type = 'object';
  private readonly __discriminator: K;
  private readonly __members: readonly [...T];
  /**
   * Custom message used for the "not an object" / "unknown
   * discriminator" parse failures. Stored so immutable chain ops
   * (`_cloneWith`) can carry it onto the clone — otherwise a chained
   * guardian silently reverts to the default messages.
   */
  private readonly __errorMessage: string | undefined;
  /** discriminator value → branch guardian. Filled at construction. */
  private readonly __lookup: ReadonlyMap<unknown, T[number]>;

  /**
   * @throws {Error} When `discriminator` is empty or non-string.
   * @throws {Error} When `members` is empty, or when two branches
   *   share the same discriminator value (would silently shadow).
   * @throws {TypeError} When a branch's discriminator field isn't
   *   an `EnumGuardian` or `LiteralGuardian`.
   * @throws {GuardianError} (at parse time, via the composed
   *   transform) when the input discriminator doesn't match any
   *   registered branch value.
   */
  constructor(
    discriminator: K,
    members: readonly [...T],
    errorMessage?: string,
    metaData?: GuardianMetaData,
  ) {
    if (!discriminator || typeof discriminator !== 'string') {
      throw new Error(
        'DiscriminatedUnionGuardian requires a non-empty discriminator key',
      );
    }
    if (!members || members.length === 0) {
      throw new Error(
        'DiscriminatedUnionGuardian requires at least one branch',
      );
    }

    // Build the lookup map. Each branch must (a) be an ObjectGuardian
    // and (b) have an EnumGuardian at the discriminator field. The
    // EnumGuardian's allowed values populate the map — multi-value
    // enums route their entire allowed set to the same branch.
    const lookup = new Map<unknown, T[number]>();
    for (const member of members) {
      if (!(member instanceof ObjectGuardian)) {
        throw new TypeError(
          `DiscriminatedUnionGuardian: every branch must be an ObjectGuardian (got ${
            (member as { constructor?: { name?: string } }).constructor?.name ??
              typeof member
          })`,
        );
      }
      const schema = member.schema as Record<string, unknown>;
      const discField = schema[discriminator];
      if (!(discField instanceof EnumGuardian)) {
        throw new TypeError(
          `DiscriminatedUnionGuardian: branch's '${discriminator}' field must be Guardian.literal(value) or Guardian.enum([...])`,
        );
      }
      const allowed = discField.allowedValues;
      if (allowed.length === 0) {
        throw new Error(
          `DiscriminatedUnionGuardian: branch's '${discriminator}' enum has no allowed values`,
        );
      }
      for (const value of allowed) {
        if (lookup.has(value)) {
          throw new Error(
            `DiscriminatedUnionGuardian: duplicate discriminator value '${
              String(value)
            }' — already routed to another branch`,
          );
        }
        lookup.set(value, member);
      }
    }

    super((input: unknown) => {
      // Validate input is a non-null object — discriminator only
      // makes sense for objects.
      if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new GuardianError(
          errorMessage ??
            `Expected object but got ${input === null ? 'null' : typeof input}`,
          {
            expected: 'object',
            got: input === null ? 'null' : typeof input,
            comparison: 'type',
            type: 'discriminatedUnion',
          },
        );
      }
      const discValue = (input as Record<string, unknown>)[discriminator];
      const branch = lookup.get(discValue);
      if (!branch) {
        const allowed = [...lookup.keys()].map(String).join(', ');
        // `String(discValue)` may yield '[object Object]' if a caller
        // sent a non-primitive discriminator — that's fine for an
        // error message; we surface the real value via `got` below.
        throw new GuardianError(
          errorMessage ??
            `Unknown ${discriminator}: '${
              String(discValue)
            }' (expected one of: ${allowed})`, // NOSONAR
          {
            expected: allowed,
            got: discValue,
            comparison: 'discriminator',
            type: 'discriminatedUnion',
          },
        );
      }
      // O(1) — delegate full validation to the matched branch.
      // Call `_composedTransform` directly to skip the branch's
      // `parse()` try/catch + isAsync check; we're already inside the
      // discriminated-union transform and any thrown error propagates
      // up correctly.
      return (branch as unknown as {
        _composedTransform(v: unknown): UnionOf<T>;
      })._composedTransform(input);
    }, metaData);

    this.__discriminator = discriminator;
    this.__members = members;
    this.__errorMessage = errorMessage;
    this.__lookup = lookup;
    // If any branch is async, the whole union is async: the transform
    // above already delegates to the matched branch's
    // `_composedTransform`, which returns a Promise for an async branch
    // — flag `isAsync` so `parse()` rejects and `parseAsync()` awaits it
    // rather than the caller receiving a pending Promise. A branch
    // holding a not-yet-resolvable `lazy()` keeps the verdict
    // provisional and is re-probed before the first parse.
    this._initAsyncProbe();
  }

  /** Branch guardians, for the deferred async probe. @internal */
  protected override _asyncProbeChildren(): ReadonlyArray<
    AsyncProbeTarget | undefined
  > {
    return this.__members;
  }

  /** The discriminator field name. */
  get discriminator(): K {
    return this.__discriminator;
  }

  /** The list of branch guardians, in declaration order. */
  get options(): readonly [...T] {
    return this.__members;
  }

  /** All discriminator values that route to a branch. */
  get allowedValues(): readonly unknown[] {
    return [...this.__lookup.keys()];
  }

  /**
   * Returns the branch guardian for a given discriminator value, or
   * `undefined` if no branch matches.
   */
  variant(value: unknown): T[number] | undefined {
    return this.__lookup.get(value);
  }

  /**
   * Emits JSON Schema 2020-12 with the OpenAPI `discriminator`
   * vocabulary (which 2020-12 incorporates) and named `$defs` for
   * each branch. `mapping` uses `$ref` strings so downstream
   * codegen tools can resolve branches by name (better fidelity
   * than the index-based mapping the OpenAPI emit path uses).
   */
  override toJSONSchema(): Record<string, unknown> {
    // Build per-branch $defs keyed by a name derived from the
    // discriminator value (sanitised for use as an identifier).
    const defs: Record<string, unknown> = {};
    const mapping: Record<string, string> = {};
    const memberRef = new Map<T[number], string>();
    let counter = 0;

    for (const [value, branch] of this.__lookup.entries()) {
      let name = memberRef.get(branch);
      if (!name) {
        // Use the first discriminator value mapped to this branch as
        // the def name (sanitised). Falls back to `Branch_N` if the
        // sanitised value would collide or be empty.
        const raw = String(value).replace(/\W/g, '_');
        name = raw && !defs[raw] ? raw : `Branch_${counter}`;
        counter++;
        // Strip the inner $schema header — only the outermost schema
        // needs it; nested $defs entries shouldn't carry it.
        const branchSchema = branch.toJSONSchema();
        const { $schema: _drop, ...inner } = branchSchema;
        defs[name] = inner;
        memberRef.set(branch, name);
      }
      mapping[String(value)] = `#/$defs/${name}`;
    }

    const out: Record<string, unknown> = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [...memberRef.values()].map((n) => ({ $ref: `#/$defs/${n}` })),
      discriminator: {
        propertyName: this.__discriminator,
        mapping,
      },
      $defs: defs,
    };
    if (this._metaData?.title) out.title = this._metaData.title;
    if (this._metaData?.description) {
      out.description = this._metaData.description;
    }
    return out;
  }

  /**
   * Emits OpenAPI 3 schema with the `discriminator` keyword set,
   * producing proper polymorphic schema documentation rather than a
   * plain `oneOf`. Each branch's OpenAPI schema is inlined; the
   * mapping table routes discriminator values to those branches by
   * position.
   */
  override toOpenAPI(): Record<string, unknown> {
    const branchSchemas = this.__members.map((m) => m.toOpenAPI());
    const mapping: Record<string, number> = {};
    for (const [value, branch] of this.__lookup.entries()) {
      const idx = this.__members.indexOf(branch);
      mapping[String(value)] = idx;
    }
    return {
      oneOf: branchSchemas,
      discriminator: {
        propertyName: this.__discriminator,
        // OpenAPI's `mapping` typically uses $ref strings; without a
        // component-registration system we emit the branch index
        // instead. Documentation generators can rewrite this.
        mapping,
      },
      ...(this._metaData?.title && { title: this._metaData.title }),
      ...(this._metaData?.description && {
        description: this._metaData.description,
      }),
    };
  }

  /**
   * Per-branch markdown documentation, headed by the discriminator
   * and the set of valid values. Each branch renders via its own
   * `toMarkdown()`.
   */
  override toMarkdown(): string {
    const lines: string[] = [];
    if (this._metaData?.title) lines.push(`### ${this._metaData.title}\n`);
    if (this._metaData?.description) {
      lines.push(`${this._metaData.description}\n`);
    }
    const validValues = [...this.__lookup.keys()]
      .map((v) => `\`${String(v)}\``)
      .join(', ');
    lines.push(
      `**Discriminator:** \`${this.__discriminator}\``,
      `**Valid \`${this.__discriminator}\` values:** ${validValues}\n`,
    );
    for (const [value, branch] of this.__lookup.entries()) {
      lines.push(
        `\n#### When \`${this.__discriminator}\` = \`${String(value)}\`\n`,
        branch.toMarkdown(),
      );
    }
    return lines.join('\n');
  }

  /**
   * Subclass hook for immutable chain operations — preserves the
   * `_discriminator` and `_members` required by the constructor
   * signature.
   */
  protected override _cloneWith(
    transform: GuardianTransform<unknown, UnionOf<T>>,
    metaData: GuardianMetaData | undefined,
  ): this {
    const cloned = new DiscriminatedUnionGuardian<K, T>(
      this.__discriminator,
      this.__members,
      this.__errorMessage,
      metaData,
    );
    cloned._composedTransform = transform;
    return cloned as this;
  }
}
