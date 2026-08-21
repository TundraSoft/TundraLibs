# Order service — the Doctor example

One app, every Doctor idea. Run it on any runtime:

```bash
deno run packages/doctor/examples/order-service/main.ts
```

| File                   | Shows                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `tokens.ts`            | `label<T>('Name')` — typed tokens for values Doctor can't `new` (config, clock, an optional reviewer)          |
| `wiring.ts`            | `Doctor.stock(label, value)`, `Doctor.prescribe(Class, { mode, factory })`, side-effect imports, `checkup()`   |
| `Logger.ts`            | `@Vial('SINGLETON')` injecting a label while it constructs                                                     |
| `Connection.ts`        | `@Vial('SCOPED')` — one per request scope; `ScopeRequiredError` without one                                    |
| `OrderRepository.ts`   | `@Vial('TRANSIENT')` whose `inject(Connection)` inherits the **ambient** scope                                 |
| `PaymentGateway.ts`    | a class with constructor arguments, prescribed with a factory                                                  |
| `AuditTrail.ts`        | a lazy getter breaking a SINGLETON cycle, using the untyped `inject('Name')` form to avoid a value import      |
| `OrderService.ts`      | the composition; an optional dependency via `Doctor.has(label)`                                                |
| `OrderHandler.ts`      | a plain class built per request with `Doctor.resolve(Class, scope)`, ended with `Doctor.discharge(scope)`      |
| `OrderService.test.ts` | a fresh world per case with `revoke` + `prescribe` (no `reset()`); fakes ride into `wire()` before `checkup()` |

Expected shape of the output (ids vary):

```text
▶ 1. wire() + checkup(): singletons built at boot {"singletons":7}
▶ 2. per-request scope: distinct connections, shared service {"a":{"status":"placed","ref":"ch_1","flagged":false,"connection":1},"b":{...,"flagged":true,"connection":2},"sameRepoConnection":true,"sameService":true}
▶ 3. discharge(req-a) → a fresh Connection for the next req-a {"before":1,"after":3}
▶ 4. SCOPED with no scope → ScopeRequiredError {"thrown":true}
▶ 5. lazy getter across the cycle {"summary":"2 audit entries, 2 orders placed"}
```
