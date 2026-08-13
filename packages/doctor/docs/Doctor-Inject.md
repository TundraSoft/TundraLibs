# inject

Resolve a registered vial by its **token — the class name** — so a consumer
never has to import the dependency class.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Signature

```typescript ignore
inject<K extends keyof VialRegistry>(token: K, scope?: string): VialRegistry[K];
```

`inject('Config')` returns the same instance `Doctor.dispense(Config)` would —
honouring the registered lifecycle — but keyed by the class name rather than the
class object. The return type is taken from [`VialRegistry`](#vialregistry), so a
mistyped token is a compile error.

```typescript ignore
import { inject } from '@tundralibs/doctor';

const config = inject('Config'); // typed as Config — no `import { Config }`
const db = inject('Database', 'req-42'); // SCOPED resolution
```

## VialRegistry

`VialRegistry` is the token → type map `inject` is typed against. It ships
**empty**; you populate it by augmenting the module — either with
[`@tundralibs/doctor/build`](Doctor-Build.md) or by hand:

```typescript ignore
declare module '@tundralibs/doctor' {
  interface VialRegistry {
    Config: import('./Config.ts').Config;
  }
}
```

Until the registry has an entry for a token, `inject('That')` is rejected at
compile time (`keyof VialRegistry` is `never`) — generate or declare the
augmentation first.

## Doctor.dispenseByName

`inject` delegates to `Doctor.dispenseByName(name, scope?)`, which looks the
class up in a name index kept in sync by `prescribe` / `revoke` / `reset`. Use
it directly when you need the loosely-typed (`unknown`) form:

```typescript
import { Doctor, Vial } from '@tundralibs/doctor';

@Vial('SINGLETON')
class Config {}

const config = Doctor.dispenseByName<Config>('Config');
```

## Throws

- [`UnregisteredVialError`](../errors/Doctor-Errors.md#unregisteredvialerror) —
  when no vial is registered under the token at runtime.
- [`ScopeRequiredError`](../errors/Doctor-Errors.md#scoperequirederror) —
  propagated when the resolved vial is `SCOPED` and no `scope` was given.

## Caveats

The token **is** the class name, so:

- Names must be unique across registered vials (last registration wins).
- They must **survive minification** — a bundler that renames classes
  (`Config` → `a`) breaks token resolution. Don't rely on this in a minified
  build; use `Doctor.dispense(Class)` there instead.

## See also

- [build](Doctor-Build.md) — generate the `VialRegistry` from your `@Vial`
  classes
- [@Vial](Doctor-Vial.md) — registers the classes `inject` resolves

---

[← Back to Doctor](../README.md)
