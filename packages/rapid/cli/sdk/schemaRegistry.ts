/**
 * @fileoverview The schemas of one generated client, each written once.
 * A schema several routes use is declared under one name and aliased for
 * the rest; a schema that carries a `title` is declared under that title;
 * and an object that is another declared object with keys left out, made
 * optional or added is written as guardian's own `pick` / `omit` /
 * `partial` / `extend` on it. A derivation is emitted only for an exact
 * match, so a derived schema accepts what the route's own would.
 * @module
 */
import {
  isUnknownSource,
  type SchemaSource,
  schemaSource,
} from './schemaSource.ts';

type Json = Record<string, unknown>;

type Root = {
  /** The declared name: a route's own (`UsersFindResponse`) or a title. */
  name: string;
  what: string;
  schema: Json;
  key: string;
  /** Other routes' names for the same schema. */
  aliases: { name: string; what: string }[];
  state: 'pending' | 'emitting' | 'done';
};

/** What {@link SchemaRegistry.finish} produces. */
export type RegisteredSchemas = {
  /** The declarations of `schemas.ts`, each after what it refers to. */
  source: string;
  /** Route name → the title it is declared under instead. */
  renamed: Map<string, string>;
};

/** Collects a client's schemas, then declares each once. */
export type SchemaRegistry = {
  /**
   * Register a route's schema under the route's own name. Returns that
   * name, or `undefined` when the schema says nothing worth declaring.
   */
  use(name: string, what: string, schema: unknown): string | undefined;
  /** Declare everything registered. */
  finish(): RegisteredSchemas;
};

const isJson = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** JSON with sorted keys: equal schemas give equal text. */
const canon = (value: unknown): string =>
  JSON.stringify(value, (_, item) =>
    isJson(item)
      ? Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      )
      : item);

const literal = (value: string): string => JSON.stringify(value);

const key = (name: string): string =>
  /^[A-Za-z_$][\w$]*$/.test(name) ? name : literal(name);

/** A non-null object with declared keys and no passthrough: what guardian's object methods apply to. */
const isShape = (schema: unknown): schema is Json & { properties: Json } =>
  isJson(schema) && schema.type === 'object' && isJson(schema.properties) &&
  schema.nullable !== true && schema.additionalProperties !== true;

/** Everything an object schema says besides its keys and its documentation. */
const beyondKeys = (schema: Json): string => {
  const {
    title: _t,
    description: _d,
    examples: _e,
    properties: _p,
    required: _r,
    ...rest
  } = schema;
  return canon(rest);
};

const requiredOf = (schema: Json): Set<string> =>
  new Set(
    (Array.isArray(schema.required) ? schema.required : []).map(String),
  );

/** A title usable as a type name, in PascalCase. */
const titleOf = (schema: Json): string | undefined => {
  if (typeof schema.title !== 'string') return undefined;
  const name = schema.title.split(/[^A-Za-z0-9]+/).filter((w) => w !== '')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return /^[A-Z][A-Za-z0-9]*$/.test(name) ? name : undefined;
};

/** Every schema nested anywhere inside `schema`, itself excluded. */
function* nested(schema: unknown): Generator<Json> {
  if (Array.isArray(schema)) {
    for (const item of schema) yield* inside(item);
  } else if (isJson(schema)) {
    for (const child of Object.values(schema)) yield* inside(child);
  }
}
function* inside(value: unknown): Generator<Json> {
  if (isJson(value) && (value.type !== undefined || isJson(value.properties))) {
    yield value;
  }
  yield* nested(value);
}

/**
 * `node` written as a guardian operation on the declared object `base`,
 * or `undefined` when it is not exactly one. Tried in order: the same
 * object, `partial`, `pick` / `omit`, `extend`.
 */
function derive(
  node: Json,
  base: Root,
  extra: (schema: unknown) => SchemaSource,
): { rank: number; source: SchemaSource } | undefined {
  if (!isShape(node) || !isShape(base.schema)) return undefined;
  if (beyondKeys(node) !== beyondKeys(base.schema)) return undefined;
  const mine = node.properties;
  const theirs = base.schema.properties;
  const shared = Object.keys(mine).filter((name) => name in theirs);
  if (shared.length === 0) return undefined;
  if (shared.some((name) => canon(mine[name]) !== canon(theirs[name]))) {
    return undefined;
  }
  const required = requiredOf(node);
  const baseRequired = requiredOf(base.schema);
  const sameNeed = shared.every((name) =>
    required.has(name) === baseRequired.has(name)
  );
  const guard = `${base.name}Schema`;
  const added = Object.keys(mine).filter((name) => !(name in theirs));
  const dropped = Object.keys(theirs).filter((name) => !(name in mine));

  if (added.length === 0 && dropped.length === 0) {
    if (sameNeed) return { rank: 0, source: { guard, type: base.name } };
    return required.size === 0
      ? {
        rank: 1,
        source: { guard: `${guard}.partial()`, type: `Partial<${base.name}>` },
      }
      : undefined;
  }
  if (!sameNeed) return undefined;
  if (added.length === 0) {
    const [method, util, names] = dropped.length <= shared.length
      ? ['omit', 'Omit', dropped]
      : ['pick', 'Pick', shared];
    return {
      rank: 2,
      source: {
        guard: `${guard}.${method}(${names.map(literal).join(', ')})`,
        type: `${util}<${base.name}, ${names.map(literal).join(' | ')}>`,
      },
    };
  }
  if (dropped.length > 0) return undefined;
  const sources = added.map((name) => {
    const source = extra(mine[name]);
    const optional = !required.has(name);
    return {
      guard: `${key(name)}: ${source.guard}${optional ? '.optional()' : ''}`,
      type: `${key(name)}${optional ? '?' : ''}: ${source.type}`,
    };
  });
  return {
    rank: 3,
    source: {
      guard: `${guard}.extend({ ${sources.map((s) => s.guard).join(', ')} })`,
      type: `${base.name} & { ${sources.map((s) => s.type).join('; ')} }`,
    },
  };
}

/**
 * A registry for one client's schemas.
 *
 * @param reserved - Whether a title is a name the generated files
 *   already use; such a title is not used as a type name.
 */
export function schemaRegistry(
  reserved: (title: string) => boolean,
): SchemaRegistry {
  const roots: Root[] = [];
  const byKey = new Map<string, Root>();
  const routeNames = new Set<string>();

  const add = (name: string, what: string, schema: Json): Root => {
    const root: Root = {
      name,
      what,
      schema,
      key: canon(schema),
      aliases: [],
      state: 'pending',
    };
    roots.push(root);
    byKey.set(root.key, root);
    return root;
  };

  return {
    use(name, what, schema) {
      if (!isJson(schema) || isUnknownSource(schemaSource(schema))) {
        return undefined;
      }
      routeNames.add(name);
      const known = byKey.get(canon(schema));
      if (known === undefined) add(name, what, schema);
      else known.aliases.push({ name, what });
      return name;
    },

    finish() {
      // A titled schema nested in a route's schema is declared too.
      const seen = new Map<string, number>();
      const count = (schemaKey: string, times = 1): void =>
        void seen.set(schemaKey, (seen.get(schemaKey) ?? 0) + times);
      for (const root of [...roots]) {
        count(root.key, 1 + root.aliases.length);
        for (const node of nested(root.schema)) {
          const nodeKey = canon(node);
          count(nodeKey, 1 + root.aliases.length);
          const title = titleOf(node);
          if (title !== undefined && !byKey.has(nodeKey)) {
            add('', `\`${title}\`.`, node);
          }
        }
      }
      // One schema per title: the one used most, since `pick`, `omit`,
      // `partial` and `extend` keep the title of what they were made from.
      const renamed = new Map<string, string>();
      const titled = new Map<string, Root>();
      const uses = (root: Root): number => seen.get(root.key) ?? 0;
      for (const root of roots) {
        const title = titleOf(root.schema);
        if (
          title === undefined || routeNames.has(title) || reserved(title)
        ) continue;
        const holder = titled.get(title);
        if (holder === undefined || uses(root) > uses(holder)) {
          titled.set(title, root);
        }
      }
      for (const [title, root] of titled) {
        for (const name of [root.name, ...root.aliases.map((a) => a.name)]) {
          if (name !== '') renamed.set(name, title);
        }
        root.name = title;
        root.aliases = [];
      }
      // Titled schemas first: they are what the rest is derived from. A
      // nested schema that lost its title to another has no name: dropped.
      const ordered = [
        ...titled.values(),
        ...roots.filter((root) =>
          root.name !== '' && titled.get(root.name) !== root
        ),
      ];
      for (const root of roots) {
        if (!ordered.includes(root)) byKey.delete(root.key);
      }

      const lines: string[] = [];
      const emit = (root: Root): void => {
        if (root.state !== 'pending') return;
        root.state = 'emitting';
        const earlier = ordered.slice(0, ordered.indexOf(root));
        const resolve = (node: Json): SchemaSource | undefined => {
          const same = byKey.get(canon(node));
          if (same !== undefined && same !== root) {
            if (same.state === 'emitting') return undefined;
            emit(same);
            return { guard: `${same.name}Schema`, type: same.name };
          }
          let best: ReturnType<typeof derive>;
          let from: Root | undefined;
          for (const base of earlier) {
            if (base.state === 'emitting') continue;
            const found = derive(
              node,
              base,
              (schema) => schemaSource(schema, {}, resolve),
            );
            if (
              found !== undefined &&
              (best === undefined || found.rank < best.rank)
            ) {
              best = found;
              from = base;
            }
          }
          if (from !== undefined) emit(from);
          return best?.source;
        };
        const source = schemaSource(root.schema, {}, resolve);
        const guardian = isShape(root.schema)
          ? 'ObjectGuardian'
          : 'FinishedGuardian';
        lines.push(`/** ${root.what} */
export type ${root.name} = ${source.type};
/** Validates {@link ${root.name}}. */
export const ${root.name}Schema: ${guardian}<${root.name}> = ${source.guard};
`);
        for (const alias of root.aliases) {
          lines.push(`/** ${alias.what} */
export type ${alias.name} = ${root.name};
/** Validates {@link ${alias.name}}. */
export const ${alias.name}Schema: ${guardian}<${alias.name}> = ${root.name}Schema;
`);
        }
        root.state = 'done';
      };
      for (const root of ordered) emit(root);
      return { source: lines.join('\n'), renamed };
    },
  };
}
