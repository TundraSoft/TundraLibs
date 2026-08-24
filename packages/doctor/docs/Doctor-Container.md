# Containers

`Doctor.createContainer()` mints an isolated **child** container: it reads
its parent's registrations but keeps its own singleton instances, scope
maps, and `stock`/`revoke` overrides. `setContainerProvider` is the
companion hook a host framework installs once so `inject()` — even after an
`await` — resolves against the right per-request container instead of
always falling back to the process-wide global.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Signature

```typescript ignore
Doctor.createContainer(): DoctorContainer;

setContainerProvider(
  provider: (() => DoctorContainer | undefined) | undefined,
): void;
```

`DoctorContainer` is the interface the global `Doctor` and every child both
implement — `prescribe`, `stock`, `revoke`, `dispense`, `dispenseByName`,
`resolve`, `checkup`, `discharge`, `dischargeAll`, `reset`, `knows`, `has`,
and `createContainer` itself, so a child can mint grandchildren the same way
— each reading through its own parent, then that parent's parent, and so on.

## Child containers

A child reads the parent's **registrations** — a `@Vial` class or a stocked
label registered on the parent resolves in the child too — but every
instance the child builds (its SINGLETON cache, its SCOPED maps, every
TRANSIENT call) is the child's own, and `stock` / `revoke` on the child never
touch the parent or a sibling child:

```typescript
import { Doctor, inject, label } from '@tundralibs/doctor';

const NAME = label<string>('Name');
Doctor.stock(NAME, 'global-value');

class Greeter {
  name = inject(NAME);
}

const acme = Doctor.createContainer();
acme.stock(NAME, 'acme-value'); // overrides NAME for `acme` only — no revoke() first needed, it's a separate map

console.log(acme.resolve(Greeter).name); // 'acme-value'
console.log(Doctor.createContainer().resolve(Greeter).name); // 'global-value' — a fresh sibling, untouched
console.log(Doctor.dispense(NAME)); // 'global-value' — the parent never changed
```

Reach for a child container when tenants (or tests, or sandboxed plugins)
need **independent registries** — different stocked config, different
overridden factories — not just independent request _state_. For
per-request isolation of the _same_ registrations within one tenant, a
SCOPED vial plus `Doctor.discharge(scope)` is the right tool and needs no
extra container at all — see [Lifecycles](../README.md#lifecycles).

> **`@Vial` always registers into the global `Doctor`.** The decorator calls
> `Doctor.prescribe` directly — never "whichever container is ambient" — so
> declaring more `@Vial` classes never gives an existing child anything new
> to override. A child only diverges from its parent once you imperatively
> call `child.prescribe(...)` or `child.stock(...)` on it.

> **A bare `new`, or any construction not routed through the child, never
> sees it.** `inject()` resolves against the _ambient_ container — the one
> whose `dispense` / `resolve` is _currently_ constructing, on the
> synchronous call stack — falling back to the global `Doctor` otherwise.
> Holding a reference to a child is not enough:
>
> ```typescript
> import { Doctor, inject, label } from '@tundralibs/doctor';
>
> const NAME = label<string>('Name');
> Doctor.stock(NAME, 'global-value');
> class Greeter {
>   name = inject(NAME);
> }
> const child = Doctor.createContainer();
> child.stock(NAME, 'child-value');
>
> console.log(new Greeter().name); // 'global-value' — NOT the child, even though `child` exists
> console.log(child.resolve(Greeter).name); // 'child-value' — constructed THROUGH the child
> ```
>
> Always construct via the child itself — `child.dispense(Vial)` for a
> registered vial, `child.resolve(PlainClass, scope?)` for anything else —
> never a bare `new` when the instance is meant to see that child's
> overrides.

> **`resolve()` reads a registered `factory` through to the parent, the
> same as `dispense()`.** `child.resolve(SomeVial)` for a class registered
> **with a custom `factory`** on an ancestor honours that factory — the
> read-through the whole container chain shares — so a class whose
> constructor needs arguments is built the way its factory intends, not with
> a bare `new`. Where `resolve()` still differs from `dispense()`: it always
> constructs a **fresh** instance — never the cached SINGLETON / SCOPED one —
> and it will build a class registered **nowhere** with a bare `new`, which
> is exactly the unregistered-per-request-handler case it exists for.

### `knows` vs `has`

`has` checks this container **and its ancestors**; `knows` checks only a
class, and only **this** container — no read-through:

```typescript
import { Doctor, Vial } from '@tundralibs/doctor';

@Vial('SINGLETON')
class Shared {}

const child = Doctor.createContainer();
console.log(child.has(Shared)); // true — read through to the parent
console.log(child.knows(Shared)); // false — not registered on the child itself
console.log(Doctor.knows(Shared)); // true — registered right here
```

Reach for `knows` when the question is specifically "did _this_ container
register it" (e.g. deciding whether a child needs its own override); `has`
for the ordinary "can I dispense this at all" check documented in
[stock](Doctor-Stock.md#has--revoke).

## Bridging an async host: `setContainerProvider`

The ambient-container stack `inject()` reads is **synchronous** — it spans
exactly one `dispense` / `resolve` call and is gone the moment that call
`await`s something. A host framework that already tracks "the current
request's container" in its own async context (built on `AsyncLocalStorage`,
e.g. [`@tundralibs/ambient`](https://jsr.io/@tundralibs/ambient)'s
`createContext`) installs a provider so `inject()` keeps resolving against
the right container across `await`s too:

```typescript
import { createContext } from '@tundralibs/ambient';
import { Doctor, inject, setContainerProvider, Vial } from '@tundralibs/doctor';
import type { DoctorContainer } from '@tundralibs/doctor';

@Vial('SINGLETON')
class Greeter {
  id = Math.random();
  greet(name: string): string {
    return `hi ${name} (${this.id})`;
  }
}

const requestContainer = createContext<DoctorContainer>();
// Call ONCE, at host startup — a later call replaces the previous provider.
setContainerProvider(() => requestContainer.get());

async function handle(
  container: DoctorContainer,
  name: string,
): Promise<string> {
  return requestContainer.run(container, async () => {
    await Promise.resolve(); // real async work happens here
    return inject(Greeter).greet(name); // still resolves against `container`
  });
}

const acme = Doctor.createContainer();
const globex = Doctor.createContainer();
console.log(await handle(acme, 'acme')); // acme's own Greeter singleton
console.log(await handle(globex, 'globex')); // globex's own — a distinct instance
```

Each tenant's `Greeter` singleton is built once and cached **in that
child**, never in the global or in a sibling — the same per-container
caching `createContainer()` gives you synchronously, now surviving `await`.

> **Install exactly one provider, once, at process/module load.** A later
> `setContainerProvider(...)` call **replaces** the previous one outright —
> it does not compose two hosts' providers. Pass `undefined` to uninstall.
>
> Precedence: a synchronous container operation already in flight (an outer
> `dispense` / `resolve` still running) **always wins over the provider** —
> the provider is consulted only when nothing is synchronously in flight.
> And when the provider itself returns `undefined` (e.g. `get()` called
> outside any `run()` scope), `inject()` falls all the way back to the
> global `Doctor` **quietly, not as an error** — a request that forgot to
> establish its context silently reads the process-wide registry instead of
> its tenant's.

## Throws

Same errors as the global `Doctor` — a child is a full `DoctorContainer` —
see [Errors](../errors/Doctor-Errors.md). `createContainer()` and
`setContainerProvider` themselves never throw.

## See also

- [inject](Doctor-Inject.md) — what actually reads the ambient container
- [stock](Doctor-Stock.md) — `Doctor.stock` / `revoke`, the per-container
  override primitive
- [Errors](../errors/Doctor-Errors.md)

---

[← Back to Doctor](../README.md)
