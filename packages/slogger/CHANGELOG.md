# Changelog

## [1.1.9](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.1.8...slogger-v1.1.9) (2026-08-19)


### Documentation

* **slogger:** document the PREFIX and SUFFIX masking strategies ([#433](https://github.com/TundraSoft/TundraLibs/issues/433)) ([b466586](https://github.com/TundraSoft/TundraLibs/commit/b466586373666d1c8e971863f4277763e9ca116b))

## [1.1.8](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.1.7...slogger-v1.1.8) (2026-08-18)


### Documentation

* **slogger:** sharpen the Browser/Worker compatibility section, merge description wording, add a missing license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

## [1.1.7](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.1.6...slogger-v1.1.7) (2026-08-17)


### Documentation

* **slogger:** document worker compatibility ([#310](https://github.com/TundraSoft/TundraLibs/issues/310)) ([18d63af](https://github.com/TundraSoft/TundraLibs/commit/18d63afc62f5caf628e90eccd5dbaf2005cc4a30))

## [1.1.6](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.1.5...slogger-v1.1.6) (2026-08-15)


### Bug Fixes

* **slogger:** mask pass and pwd by default, and stop the two docs disagreeing ([#282](https://github.com/TundraSoft/TundraLibs/issues/282)) ([a90413e](https://github.com/TundraSoft/TundraLibs/commit/a90413e382ab5eb9406a229f6ccd56886acbbcae))
* **slogger:** warn when FileHandler writes to a filesystem that cannot persist ([#287](https://github.com/TundraSoft/TundraLibs/issues/287)) ([91a76b4](https://github.com/TundraSoft/TundraLibs/commit/91a76b484ae5004f28ab6b08290b7d5bc315273c))


### Documentation

* note the extra install on cross-package examples ([#298](https://github.com/TundraSoft/TundraLibs/issues/298)) ([44e1eff](https://github.com/TundraSoft/TundraLibs/commit/44e1effee2ae174946e2cdb0356fbc12d8c9ed4a))

## [1.1.5](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.1.4...slogger-v1.1.5) (2026-08-14)


### Bug Fixes

* **slogger:** return a ScopedSlogger type instead of casting to Slogger ([#254](https://github.com/TundraSoft/TundraLibs/issues/254)) ([60c5b3f](https://github.com/TundraSoft/TundraLibs/commit/60c5b3fe4606d13a69558f7c1b9b29e2b4a24d0a))

## [1.1.4](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.1.3...slogger-v1.1.4) (2026-08-13)


### Bug Fixes

* **slogger:** import compat via subpaths instead of the root barrel ([3456aeb](https://github.com/TundraSoft/TundraLibs/commit/3456aeb2f9caa49439f957340a661bf0434a5732))

## [1.1.3](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.1.2...slogger-v1.1.3) (2026-08-12)


### Bug Fixes

* **utils:** harden Events and Options; adopt across the suite ([b32ffc4](https://github.com/TundraSoft/TundraLibs/commit/b32ffc4e9f9a4971070fd1a928141678d7cd4fce))

## [1.1.2](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.1.1...slogger-v1.1.2) (2026-08-09)


### Documentation

* **slogger:** adopt tracer.logContext in correlation guide ([562b3e7](https://github.com/TundraSoft/TundraLibs/commit/562b3e7fa3995fa97cd638f052ff6f2f6b320472))

## [1.1.1](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.1.0...slogger-v1.1.1) (2026-08-09)


### Documentation

* **slogger:** add the correlation guide ([6fb941d](https://github.com/TundraSoft/TundraLibs/commit/6fb941d0a6dbf1075a94878d0cbf680b4b9ce6d0))
* **slogger:** make the recipes wiki-visible and link them from the README ([4142313](https://github.com/TundraSoft/TundraLibs/commit/414231368a953c86a3b0fb01aac9652a2f126b76))
* **slogger:** wiki-visible recipes + the correlation guide ([3d13a85](https://github.com/TundraSoft/TundraLibs/commit/3d13a85f2d31ed4c2cf487d5361ca01b4b903d48))

## [1.1.0](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.0.0...slogger-v1.1.0) (2026-08-09)


### Features

* **slogger:** add contextProvider for automatic context correlation ([47f4e6b](https://github.com/TundraSoft/TundraLibs/commit/47f4e6bede46de0c074c16108419eacc2b69123e))
* **slogger:** add contextProvider hook for request-context correlation ([6a8cfd1](https://github.com/TundraSoft/TundraLibs/commit/6a8cfd1ffee38e9301aed31bf7aace2ba4d23b52))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/slogger-v1.0.0-dev12...slogger-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev12](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/slogger-v1.0.0-dev11...slogger-v1.0.0-dev12) (2026-07-28)


### Documentation

* **slogger:** correct log-method context param type (LogContext, not SlogObject) ([9fa5917](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9fa59171ca0079ee7a673bcf4d54cbc914b0d59b))

## [1.0.0-dev11](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/slogger-v1.0.0-dev10...slogger-v1.0.0-dev11) (2026-07-28)


### Documentation

* **slogger:** fix broken README/handler examples + sampling option name ([54dcd1b](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/54dcd1b4e5a81dececfba79dddc8f04ebf868d5d))

## [1.0.0-dev10](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/slogger-v1.0.0-dev9...slogger-v1.0.0-dev10) (2026-07-27)


### Documentation

* **slogger:** createSlogger docs describe reference-identity config comparison ([7ff128d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7ff128d5f83eb40a0e664d7785aafb408d1a1c8c))

## [1.0.0-dev9](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/slogger-v1.0.0-dev8...slogger-v1.0.0-dev9) (2026-07-25)


### Bug Fixes

* **slogger:** resolve round-3 review findings ([a0e96f7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a0e96f7e7ced9a53d9e7eef01f37d1ceeab211c0))
* **slogger:** resolve round-4 review findings ([61ff1ad](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/61ff1ad1af555e9a91a04ef97e81e6bfc71c7d26))
* **slogger:** resolve round-5 masking findings ([2b9d767](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2b9d767460ef45341e580604be04f164e4e77982))
* **slogger:** resolve round-6 review findings ([f677b27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f677b27546fc2ef930e65bde91dab8910c31c9f9))
* **slogger:** resolve round-7 review findings ([caaafa6](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/caaafa67c4b3354405dcedb6f67d48b765a79147))

## [1.0.0-dev8](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/slogger-v1.0.0-dev7...slogger-v1.0.0-dev8) (2026-07-23)


### Bug Fixes

* **slogger:** close re-review findings — partial-write loops, masking non-scalars, FileHandler double-open ([31fed3a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/31fed3a41e85f690ac96a9c2b4e1ea639ff15103))
* **slogger:** close review findings — finalize isolation, typed errors, masking + HTTP buffer fixes ([4a4a60e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4a4a60e313a5d04ae58ffb38cd3bcf3d0d65eeff))


### Documentation

* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/slogger-v1.0.0-dev6...slogger-v1.0.0-dev7) (2026-07-14)


### ⚠ BREAKING CHANGES

* **slogger:** normalise option names + units (BREAKING)

### Features

* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* **compat,slogger:** UDP support — `udpSocket()` primitive + SyslogHandler UDP transport ([06ce265](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/06ce265aade23ac51feb70babf4c2b4fe659768c))
* **guardian,slogger:** infer-as-type / tuple / record(1-arg) / LogContext ([1a9958d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1a9958d2dd775b325c6e4e93cc7149c6a2dfb1ec))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))
* **slogger:** add MemoryHandler, StreamHandler, TCPHandler + ([5561f83](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5561f8335acf15b0c82797d1df0c65bcff3c1541))
* **slogger:** add Slogger.scope(bindings) + LogManager scopes sugar ([01e5eef](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/01e5eef2fbff775844f15656fc3322b4f9b9decb))
* **slogger:** SyslogHandler + rfc5424Formatter (RFC 5424 wire format ([3e269d8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3e269d8f178279824f6ac6910d0ea9071ab82479))


### Bug Fixes

* **drivers,compat-sweep:** three audit bugs; cross-runtime testability ([4a3ff55](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4a3ff551482b02c4cfc94a30c0ae85ea5be0fb29))
* **global:** Formatting ([beb76e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/beb76e427ab0fa202f963705d58e329553aed456))
* **slogger:** Add more tests ([f9d459f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f9d459f029f4a2c8d296ec427dd5ce235b52c506))
* **slogger:** format and lint issues ([0c63378](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0c63378d879e5178c998a0f546fdc9fc49b45cc2))
* **slogger:** Formatting ([3ef24b1](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3ef24b14b3c51a3ea3e35ddf9b87b16d031e4f13))
* **slogger:** make message interpolation opt-in; harden _lookup ([fd774e3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/fd774e38bfffbb4844352c1efae4274185a34d4b))
* **slogger:** remove unused SyslogFacilities import ([7ebd398](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7ebd398557dc6a3430f3dc0baa9fc93731c7cf79))
* **slogger:** resolve high/medium review findings ([45c3285](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/45c3285594fa7692659fe44cfc07b3e894068bf4))


### Performance

* **slogger:** hot-path fixes — 5.0 µs → 2.0 µs per info() call ([f1c8461](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f1c84619106935731e5af6c22946c84bc03bd644))


### Refactoring

* **restler:** name exported-type files after their identifier ([5322e27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5322e27d36a57a283228ed7b56207821f2b4a7eb))
* **slogger:** align privacy prefixes with CONVENTIONS ([a394f29](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a394f29ff24123dfe0038de1404d7c0d6cc23ec3))
* **slogger:** double-underscore private register methods ([87771e7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/87771e7dd604b90f406574c8f568410fe1194957))
* **slogger:** name exported-type files after their identifier ([240ce55](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/240ce55e25be91ec4bb3b92f3e5616b72bfcd31e))
* **slogger:** normalise option names + units (BREAKING) ([a623e19](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a623e1976b4a4027d1518a27ca488d2a2d9763f9))
* **utils:** consolidate template engine — templatize is now the ([60bc296](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/60bc2960ae93329a474b71beeee4707abb181611))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* **non-wip:** strip \`[@since](https://github.com/since) 1.0.0\` from drivers/slogger/crypt/guardian/oql/cacher/id/hub ([4adf84d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4adf84d2a633bc2f016edd7384a657cf472af706))
* rename [@tundrasoft](https://github.com/tundrasoft) → [@tundralibs](https://github.com/tundralibs) across all package docs; add cacher docs ([5f7fffd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5f7fffdb410a6fa199a77231b304cdb4245158a0))
* **slogger,guardian:** code reviews — comparisons vs pino and zod ([d341638](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d341638f0fce138603280c77151609dfca62cf1f))
* **slogger,guardian:** correct review claims after running rigorous checks ([05e7fef](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/05e7fefbd0f67ff5f3897c3bbf78aad78e28d1b5))
* **slogger:** reframe as destination-flexible (drop "high-performance"); remove REVIEW.md ([19235ce](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/19235ce026f810e9be13986a35771b06986e7140))
* **slogger:** Update documentation ([1fb0e2d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1fb0e2d60b515fa3b1121cd04a035b349cadadc8))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/slogger-v1.0.0-dev6...slogger-v1.0.0-dev7) (2026-07-14)


### ⚠ BREAKING CHANGES

* **slogger:** normalise option names + units (BREAKING)

### Features

* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* **compat,slogger:** UDP support — `udpSocket()` primitive + SyslogHandler UDP transport ([06ce265](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/06ce265aade23ac51feb70babf4c2b4fe659768c))
* **guardian,slogger:** infer-as-type / tuple / record(1-arg) / LogContext ([1a9958d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1a9958d2dd775b325c6e4e93cc7149c6a2dfb1ec))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))
* **slogger:** add MemoryHandler, StreamHandler, TCPHandler + ([5561f83](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5561f8335acf15b0c82797d1df0c65bcff3c1541))
* **slogger:** add Slogger.scope(bindings) + LogManager scopes sugar ([01e5eef](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/01e5eef2fbff775844f15656fc3322b4f9b9decb))
* **slogger:** SyslogHandler + rfc5424Formatter (RFC 5424 wire format ([3e269d8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3e269d8f178279824f6ac6910d0ea9071ab82479))


### Bug Fixes

* **drivers,compat-sweep:** three audit bugs; cross-runtime testability ([4a3ff55](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4a3ff551482b02c4cfc94a30c0ae85ea5be0fb29))
* **global:** Formatting ([beb76e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/beb76e427ab0fa202f963705d58e329553aed456))
* **slogger:** Add more tests ([f9d459f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f9d459f029f4a2c8d296ec427dd5ce235b52c506))
* **slogger:** format and lint issues ([0c63378](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0c63378d879e5178c998a0f546fdc9fc49b45cc2))
* **slogger:** Formatting ([3ef24b1](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3ef24b14b3c51a3ea3e35ddf9b87b16d031e4f13))
* **slogger:** make message interpolation opt-in; harden _lookup ([fd774e3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/fd774e38bfffbb4844352c1efae4274185a34d4b))
* **slogger:** remove unused SyslogFacilities import ([7ebd398](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7ebd398557dc6a3430f3dc0baa9fc93731c7cf79))
* **slogger:** resolve high/medium review findings ([45c3285](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/45c3285594fa7692659fe44cfc07b3e894068bf4))


### Performance

* **slogger:** hot-path fixes — 5.0 µs → 2.0 µs per info() call ([f1c8461](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f1c84619106935731e5af6c22946c84bc03bd644))


### Refactoring

* **restler:** name exported-type files after their identifier ([5322e27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5322e27d36a57a283228ed7b56207821f2b4a7eb))
* **slogger:** align privacy prefixes with CONVENTIONS ([a394f29](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a394f29ff24123dfe0038de1404d7c0d6cc23ec3))
* **slogger:** double-underscore private register methods ([87771e7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/87771e7dd604b90f406574c8f568410fe1194957))
* **slogger:** name exported-type files after their identifier ([240ce55](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/240ce55e25be91ec4bb3b92f3e5616b72bfcd31e))
* **slogger:** normalise option names + units (BREAKING) ([a623e19](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a623e1976b4a4027d1518a27ca488d2a2d9763f9))
* **utils:** consolidate template engine — templatize is now the ([60bc296](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/60bc2960ae93329a474b71beeee4707abb181611))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* **non-wip:** strip \`[@since](https://github.com/since) 1.0.0\` from drivers/slogger/crypt/guardian/oql/cacher/id/hub ([4adf84d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4adf84d2a633bc2f016edd7384a657cf472af706))
* rename [@tundrasoft](https://github.com/tundrasoft) → [@tundralibs](https://github.com/tundralibs) across all package docs; add cacher docs ([5f7fffd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5f7fffdb410a6fa199a77231b304cdb4245158a0))
* **slogger,guardian:** code reviews — comparisons vs pino and zod ([d341638](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d341638f0fce138603280c77151609dfca62cf1f))
* **slogger,guardian:** correct review claims after running rigorous checks ([05e7fef](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/05e7fefbd0f67ff5f3897c3bbf78aad78e28d1b5))
* **slogger:** reframe as destination-flexible (drop "high-performance"); remove REVIEW.md ([19235ce](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/19235ce026f810e9be13986a35771b06986e7140))
* **slogger:** Update documentation ([1fb0e2d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1fb0e2d60b515fa3b1121cd04a035b349cadadc8))
