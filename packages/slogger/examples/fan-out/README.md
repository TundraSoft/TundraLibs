# Fan-out — the Slogger example

One `Slogger` instance, six handlers, three log calls — proof that a
single call really does fan out to six genuinely different wire shapes
in-process, with no external transport. Everything is meant to be
copied wholesale into a real project. Run it on any runtime:

```bash
deno run --allow-all packages/slogger/examples/fan-out/main.ts
bun run packages/slogger/examples/fan-out/main.ts
node --import tsx packages/slogger/examples/fan-out/main.ts
```

| File      | Shows                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts` | Six handlers on one `Slogger` — `detailed`/`jsonFormatter`/`logfmtFormatter`/`rfc5424Formatter`/`otelLogFormatter` to the console, plus a `FileHandler` writing real NDJSON to a temp directory — fed by the same `info`/`warning`/`error`/`debug` calls |

Needs a separate install alongside `@tundralibs/slogger`:
`@tundralibs/compat` (the cross-runtime temp directory the `FileHandler`
writes into — created and removed by this script, the only disk write
it makes).

Expected shape of the output (timestamps/ULIDs/PID/hostname/temp path
vary run to run; structure and ordering don't — captured from a real
`deno run` / `bun run` / `node --import tsx` run, all three byte-identical
apart from those fields):

```text
=== 1. logger.info("user signed in", { userId, plan }) ===
2026-08-24T10:53:56.172Z [INFO] [fanout-demo] [Mac] user signed in
{"id":"01M0SPFKJCT7JQ70P42B57QV96","appName":"fanout-demo","hostname":"Mac","levelName":"INFO","level":6,"context":{"userId":"u_42","plan":"pro"},"message":"user signed in","date":"2026-08-24T10:53:56.172Z","isoDate":"2026-08-24T10:53:56.172Z","timestamp":1787568836172}
ts=2026-08-24T10:53:56.172Z level=info app=fanout-demo host=Mac msg="user signed in" userId=u_42 plan=pro
<14>1 2026-08-24T10:53:56.172Z Mac fanout-demo 54093 - - user signed in
{"timeUnixNano":"1787568836172000000","severityNumber":9,"severityText":"INFO","body":"user signed in","attributes":{"userId":"u_42","plan":"pro"},"resource":{"service.name":"fanout-demo","host.name":"Mac","deployment.environment":"demo"}}

=== 2. logger.warning("payment retry", { orderId, attempt }) ===
...five more lines, one per handler (WARNING severity: PRI 12, OTel severityNumber 13)...

=== 3. logger.error("charge failed", { orderId, reason }) ===
...five more lines (ERROR severity: PRI 11, OTel severityNumber 17)...

=== 4. logger.debug(...) — below the INFO threshold ===
(nothing printed above — filtered before any handler ran)

=== Persisted to disk (NDJSON): /var/folders/.../T/slogger-fanout-.../fanout.log ===
{"id":"01M0SPFKJCT7JQ70P42B57QV96","appName":"fanout-demo", ... "message":"user signed in", ...}
{"id":"01M0SPFKJCFT9B5B6ASG7TBYC6","appName":"fanout-demo", ... "message":"payment retry", ...}
{"id":"01M0SPFKJC1T06JBXVR5Y875MQ","appName":"fanout-demo", ... "message":"charge failed", ...}
```

Note the RFC 5424 line has **two** trailing `-` before the message
(`... 54093 - - user signed in`): MSGID and STRUCTURED-DATA are both
NILVALUE here because this example doesn't set `messageId` — see
[`rfc5424Formatter`](../../formatters/Slogger-Formatters.md) if you want
a MSGID populated instead.

## What to steal for your own project

| Feature demonstrated                                                                                          | Read next                                                                        |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Declarative multi-handler config on one `Slogger`                                                             | [../../docs/Slogger-Configuration.md](../../docs/Slogger-Configuration.md)       |
| Passing a formatter factory (`rfc5424Formatter({...})`) directly, vs. a registered string name (`'detailed'`) | [../../formatters/Slogger-Formatters.md](../../formatters/Slogger-Formatters.md) |
| `otelLogFormatter` for an OTel collector's `/v1/logs`                                                         | [../../docs/Slogger-Correlation.md](../../docs/Slogger-Correlation.md)           |
| The INFO-threshold early exit (`logger.debug` above)                                                          | [../../README.md](../../README.md#hot-path-optimizations)                        |
| `FileHandler` buffering + the guaranteed `finalize()` flush                                                   | [../../README.md](../../README.md#core-api)                                      |

---

[← Back to Slogger](../../README.md)
