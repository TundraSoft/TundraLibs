# Changelog

## [1.0.7](https://github.com/TundraSoft/TundraLibs/compare/cacher-v1.0.6...cacher-v1.0.7) (2026-08-21)


### Refactoring

* **cacher:** route timer unref through compat and align Workers support ([#508](https://github.com/TundraSoft/TundraLibs/issues/508)) ([e345e2c](https://github.com/TundraSoft/TundraLibs/commit/e345e2c11425444588beae5050362f4e9d448052))

## [1.0.6](https://github.com/TundraSoft/TundraLibs/compare/cacher-v1.0.5...cacher-v1.0.6) (2026-08-19)


### Documentation

* **cacher:** correct defaultExpiry max and finalize return type in docs ([#429](https://github.com/TundraSoft/TundraLibs/issues/429)) ([230443b](https://github.com/TundraSoft/TundraLibs/commit/230443b335dcfa1398f97bbb814cc539332998bd))

## [1.0.5](https://github.com/TundraSoft/TundraLibs/compare/cacher-v1.0.4...cacher-v1.0.5) (2026-08-18)


### Documentation

* **cacher:** sharpen the Browser/Worker compatibility section, sync the package.json description, add a missing license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

## [1.0.4](https://github.com/TundraSoft/TundraLibs/compare/cacher-v1.0.3...cacher-v1.0.4) (2026-08-17)


### Documentation

* **cacher:** document worker compatibility ([#308](https://github.com/TundraSoft/TundraLibs/issues/308)) ([7c57501](https://github.com/TundraSoft/TundraLibs/commit/7c575012eec1c00d39d33489fb48b2a1d83c974e))

## [1.0.3](https://github.com/TundraSoft/TundraLibs/compare/cacher-v1.0.2...cacher-v1.0.3) (2026-08-15)


### Bug Fixes

* **compat:** path fallback, barrel test leak, and the udpSocket hang on Workers ([#283](https://github.com/TundraSoft/TundraLibs/issues/283)) ([317fc0f](https://github.com/TundraSoft/TundraLibs/commit/317fc0fdbaae712ed913a40f70852188508f0e0f))

## [1.0.2](https://github.com/TundraSoft/TundraLibs/compare/cacher-v1.0.1...cacher-v1.0.2) (2026-08-14)


### Documentation

* **cacher:** verify documentation examples and document the public API ([#244](https://github.com/TundraSoft/TundraLibs/issues/244)) ([01c5290](https://github.com/TundraSoft/TundraLibs/commit/01c52905919b11e7d2dd90e802972c045a88daa9))

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/cacher-v1.0.0...cacher-v1.0.1) (2026-08-12)


### Bug Fixes

* **utils:** harden Events and Options; adopt across the suite ([b32ffc4](https://github.com/TundraSoft/TundraLibs/commit/b32ffc4e9f9a4971070fd1a928141678d7cd4fce))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/cacher-v1.0.0-dev11...cacher-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev11](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/cacher-v1.0.0-dev10...cacher-v1.0.0-dev11) (2026-07-28)


### Documentation

* **cacher:** correct thrown error/code in engines documentation ([0c8b2b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0c8b2b23f71bd5697e69e6e1b67dde248b888356))

## [1.0.0-dev10](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/cacher-v1.0.0-dev9...cacher-v1.0.0-dev10) (2026-07-27)


### Bug Fixes

* **cacher:** redact shared references in full instead of [Circular] ([003fadc](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/003fadc78aa062af3af44b1103aa2a6a650fd22a))
* **cacher:** redact shared references in full instead of marking them [Circular] ([ac1798d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ac1798d6fdd7067dd3616431c9559a50571e5676))

## [1.0.0-dev9](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/cacher-v1.0.0-dev8...cacher-v1.0.0-dev9) (2026-07-25)


### Bug Fixes

* **cacher:** resolve round-3 review findings ([71fb882](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/71fb882d4a7e9389a24a133b17bc8d6f693a0eaf))
* **cacher:** resolve round-4 review findings ([8b0462a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8b0462a88fed47701ca5d170c24e8f6d8a6f4644))
* **cacher:** resolve round-5 review findings ([3b3133b](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3b3133b1053bfbb9e3a5477c129059916821ca91))

## [1.0.0-dev8](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/cacher-v1.0.0-dev7...cacher-v1.0.0-dev8) (2026-07-23)


### Bug Fixes

* **cacher:** close re-review findings — namespace-scoped clear, exptime-0, Value split ([dc51abe](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/dc51abe0e65d224a6a71ab36971f83b37fc1a723))
* **cacher:** namespace-scoped Memcached clear, permanent expiry=0, Value type split ([edc57e0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/edc57e0ee0c155099ce68e8635491d7aa5c52e4e))
* **cacher:** resolve 8 review findings (password leak, has/get mismatch, expiry footgun) ([3f9959d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3f9959dabb79a908fad71ab2a82a439ff2725ed4))


### Documentation

* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/cacher-v1.0.0-dev6...cacher-v1.0.0-dev7) (2026-07-14)


### Features

* **cacher:** migrate Redis engine to use @tundralibs/drivers/redis ([0fbf096](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0fbf09698d9c018071c86ff54611af7363c65ce6))
* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))


### Bug Fixes

* **cacher:** add tests ([933a4b6](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/933a4b6a2a4ea6b3f2ef25c908ba181537791097))
* **cacher:** resolve high/medium review findings ([8d6384d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8d6384dfabb39c240ef4b4e633b082ecef986a1b))
* **cacher:** type expiry timers as ReturnType&lt;typeof setTimeout&gt; ([70ba38f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/70ba38f841fe3a47e4bf3713a68a4fbd38f27e1b))


### Refactoring

* **cacher:** convention fixes ([#1](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/1), [#2](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/2), [#3](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/3)) ([2c5d106](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2c5d106f256a3dc14bfbf0e9491032553927ebea))
* **cacher:** name exported-type files after their identifier ([04539d9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/04539d9477ab91b7bd094cfb61319cd750922127))
* **drivers,compat,cacher:** unify TLS surface, add upgradeTls + Postgres/Redis/Memcached TLS ([34023a5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34023a5ec1b43d34aaa29876ffb9f6243724bac5))
* **restler:** name exported-type files after their identifier ([5322e27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5322e27d36a57a283228ed7b56207821f2b4a7eb))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* rename [@tundrasoft](https://github.com/tundrasoft) → [@tundralibs](https://github.com/tundralibs) across all package docs; add cacher docs ([5f7fffd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5f7fffdb410a6fa199a77231b304cdb4245158a0))
