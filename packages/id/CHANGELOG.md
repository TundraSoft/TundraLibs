# Changelog

## [1.1.2](https://github.com/TundraSoft/TundraLibs/compare/id-v1.1.1...id-v1.1.2) (2026-08-21)


### Documentation

* **id:** fix process-id wording and document Workers/browser support ([#502](https://github.com/TundraSoft/TundraLibs/issues/502)) ([ce4c018](https://github.com/TundraSoft/TundraLibs/commit/ce4c0187cc765575c41f795b9629df1b0e28ac5c))

## [1.1.1](https://github.com/TundraSoft/TundraLibs/compare/id-v1.1.0...id-v1.1.1) (2026-08-20)


### Performance

* **id:** batch per-call CSPRNG draws in cuid and cuid2 ([844b3ba](https://github.com/TundraSoft/TundraLibs/commit/844b3ba71355c8272da918110dec924c62659f94))

## [1.1.0](https://github.com/TundraSoft/TundraLibs/compare/id-v1.0.7...id-v1.1.0) (2026-08-20)


### Features

* **compat:** cross-runtime bench harness and WebServer performance pass ([22b5000](https://github.com/TundraSoft/TundraLibs/commit/22b500054e77359902577e03b7830f2b100d47b6))

## [1.0.7](https://github.com/TundraSoft/TundraLibs/compare/id-v1.0.6...id-v1.0.7) (2026-08-19)


### Documentation

* **id:** correct ObjectID format, SequenceID entropy, and module summary ([#434](https://github.com/TundraSoft/TundraLibs/issues/434)) ([456aeb7](https://github.com/TundraSoft/TundraLibs/commit/456aeb7ed3682425bf774a0f563f02a424804857))

## [1.0.6](https://github.com/TundraSoft/TundraLibs/compare/id-v1.0.5...id-v1.0.6) (2026-08-18)


### Documentation

* **id:** add Browser and Cloudflare Workers badges, add NanoID to the description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

## [1.0.5](https://github.com/TundraSoft/TundraLibs/compare/id-v1.0.4...id-v1.0.5) (2026-08-15)


### Documentation

* note the extra install on cross-package examples ([#298](https://github.com/TundraSoft/TundraLibs/issues/298)) ([44e1eff](https://github.com/TundraSoft/TundraLibs/commit/44e1effee2ae174946e2cdb0356fbc12d8c9ed4a))

## [1.0.4](https://github.com/TundraSoft/TundraLibs/compare/id-v1.0.3...id-v1.0.4) (2026-08-14)


### Documentation

* **id:** verify documentation examples and document the public API ([#249](https://github.com/TundraSoft/TundraLibs/issues/249)) ([dea99a0](https://github.com/TundraSoft/TundraLibs/commit/dea99a0b3a60d0e4b94fb699f10833642576ac5f))

## [1.0.3](https://github.com/TundraSoft/TundraLibs/compare/id-v1.0.2...id-v1.0.3) (2026-08-13)


### Bug Fixes

* **id:** republish as 1.0.3 ([5de296b](https://github.com/TundraSoft/TundraLibs/commit/5de296b9ae28eaf1786a1397f0262f940395b02a))

## [1.0.2](https://github.com/TundraSoft/TundraLibs/compare/id-v1.0.1...id-v1.0.2) (2026-08-13)


### Bug Fixes

* **id:** import compat via subpaths instead of the root barrel ([7e87260](https://github.com/TundraSoft/TundraLibs/commit/7e87260acaf90cb3b4b9352f03abf5ab21b31167))

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/id-v1.0.0...id-v1.0.1) (2026-08-12)


### Bug Fixes

* **utils:** harden Events and Options; adopt across the suite ([b32ffc4](https://github.com/TundraSoft/TundraLibs/commit/b32ffc4e9f9a4971070fd1a928141678d7cd4fce))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/id-v1.0.0-dev12...id-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev12](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/id-v1.0.0-dev11...id-v1.0.0-dev12) (2026-07-28)


### Documentation

* **id:** correct simpleID daily counter reset behavior (resets to 0, not seed) ([23ca48f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/23ca48fbcbe41c7ee3800c2d1d47cee42f419eac))

## [1.0.0-dev11](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/id-v1.0.0-dev10...id-v1.0.0-dev11) (2026-07-28)


### Documentation

* **id:** correct nanoID alphabet + sequenceID counter documentation ([0b54804](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0b54804c62474bbb758de4f1887994c080b3162d))

## [1.0.0-dev10](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/id-v1.0.0-dev9...id-v1.0.0-dev10) (2026-07-27)


### Documentation

* **id:** correct cuid timestamp-overflow year comment (2059, not ~4503) ([6f86c1d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6f86c1d2c8b6126c3ac68a1f27cdd9cbf8b922f4))

## [1.0.0-dev9](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/id-v1.0.0-dev8...id-v1.0.0-dev9) (2026-07-25)


### Bug Fixes

* **id:** add round-3 regression tests and doc updates ([109bb05](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/109bb05fe9f4c846fa7e0841a5f7b18697023411))
* **id:** resolve round-3 review findings ([a330907](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a330907f47dbbbb86a04a11ffa2b90921db96556))
* **id:** resolve round-4 review findings ([4c40cf4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4c40cf48c465d7c0844083fa3ef52829e6d46416))
* **id:** resolve round-5 review findings ([ab82456](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ab824564d067093cdc1bafb3fc82928651c16d37))

## [1.0.0-dev8](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/id-v1.0.0-dev7...id-v1.0.0-dev8) (2026-07-23)


### Bug Fixes

* **id:** close re-review findings — errors/ folder, width-bounded ObjectID timestamp, cheaper simpleID, doc drift ([229eb3b](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/229eb3be0644b5e32087868c0a20a1faa4b82245))
* **id:** close re-review findings (errors/ folder, ObjectID timestamp width, simpleID perf, doc drift) ([765d092](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/765d0921afa0b9557d21b0565c024946c583882d))
* **id:** resolve 10 review findings (ObjectID overflow, doc drift, fake-coverage tests) ([da3ae13](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/da3ae135a724420584cf9752223f3b6cd41789f5))


### Documentation

* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/id-v1.0.0-dev6...id-v1.0.0-dev7) (2026-07-14)


### Features

* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* **guardian,id:** Guardian.lazy + Guardian.intersection + id.cuid/cuid2 ([5fb6f23](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5fb6f2341431654f7ed22191ca1fe288f652a3ae))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))


### Bug Fixes

* **global:** Formatting ([beb76e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/beb76e427ab0fa202f963705d58e329553aed456))
* **id/sequenceID:** restore counter to 24 bits, drop broken random component ([8ed57d5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8ed57d530ba1f5cb861855c0e7a106594abcd71f))
* **id:** minor edits in sequenceID and documentation update ([cc578df](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/cc578df223ecdd752fa3d8ec479a189f55d84f8a))
* **id:** resolve high/medium review findings ([31d0f7e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/31d0f7ef8da01f8fad27b9d910381d6b6ff07e47))
* set the versions ([ebc3855](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ebc385530b1b36a76fe003320fb9c54460ba0df4))


### Refactoring

* **crypt:** convention fixes — types/ folders + JWT/errors/ ([acd822b](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/acd822b5ddb5775158a3c6461b63669048129175))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* **id:** document cuid + cuid2 in ID.md and dedicated guides ([9463adc](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9463adc29a56749b2670a5ff9086abc2379814b9))
* **id:** Update documentation of ID package ([0a3f8ec](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0a3f8ec21bd7a86a3a3b48551b3dd1ee15d9c0ae))
* **non-wip:** strip \`[@since](https://github.com/since) 1.0.0\` from drivers/slogger/crypt/guardian/oql/cacher/id/hub ([4adf84d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4adf84d2a633bc2f016edd7384a657cf472af706))
* rename [@tundrasoft](https://github.com/tundrasoft) → [@tundralibs](https://github.com/tundralibs) across all package docs; add cacher docs ([5f7fffd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5f7fffdb410a6fa199a77231b304cdb4245158a0))
