# Changelog

## [0.10.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.9.0...rapid-v0.10.0) (2026-10-05)


### Features

* **rapid:** docs() takes an access string ([#779](https://github.com/TundraSoft/TundraLibs/issues/779)) ([ab8af67](https://github.com/TundraSoft/TundraLibs/commit/ab8af679bae95f6192c59f2bc4ddb4abe2aa1890))


### Documentation

* **rapid:** composed parts share the page's request state ([#780](https://github.com/TundraSoft/TundraLibs/issues/780)) ([4fa0edf](https://github.com/TundraSoft/TundraLibs/commit/4fa0edf7a69716895023c10b74f0618677c4d343))

## [0.9.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.8.4...rapid-v0.9.0) (2026-10-05)


### ⚠ BREAKING CHANGES

* **rapid:** `Application.initialize` loads config files with `placeholders: 'error'`, so a `${VAR}` that is not set fails the boot naming the file and the variable instead of staying literal text. Pass `placeholders: 'literal'` in the factory options for the old behaviour.
* **rapid:** `ctx.setAuth` and the pact adapter's `authenticate` middleware are removed. Identity comes only from the binding passed to `app.auth`, which `pactAuth` returns as `binding`; declare `access` strings on routes instead of permission middleware.

### Features

* **rapid:** `compose` — a page's parts run in-process under one request ([#757](https://github.com/TundraSoft/TundraLibs/issues/757)) ([a1d58b4](https://github.com/TundraSoft/TundraLibs/commit/a1d58b46b5de0fff8ec77ffc8b9d6de53c5e362f))
* **rapid:** `state()`, `surface()`, `clientAddress()` binders; schemas on `param()` and `query()` ([#761](https://github.com/TundraSoft/TundraLibs/issues/761)) ([2f62b2c](https://github.com/TundraSoft/TundraLibs/commit/2f62b2ccb925ad3bb6b4dc147a30eb0a886ee15d))
* **rapid:** an unset `${VAR}` in a config file fails the boot ([8e3e30d](https://github.com/TundraSoft/TundraLibs/commit/8e3e30dc686d0deec43e04b0f94fe7d1f8a335ba))
* **rapid:** auth binding, `access` strings and the access audit ([24f1847](https://github.com/TundraSoft/TundraLibs/commit/24f1847bc30709f2eb32842e2dcc30396d1f57f3))
* **rapid:** layoutData — a route hands per-page data to the module layout ([#778](https://github.com/TundraSoft/TundraLibs/issues/778)) ([67bfd79](https://github.com/TundraSoft/TundraLibs/commit/67bfd79c62f93cc74698d3f7979e9fd5ebf241ef))
* **rapid:** per-viewer OpenAPI `filter` on openapi() and docs() ([#762](https://github.com/TundraSoft/TundraLibs/issues/762)) ([08dd28e](https://github.com/TundraSoft/TundraLibs/commit/08dd28ecce9cd708c757e806ff7f63215bb677a9))
* **rapid:** route `cache` option and the `app.cache()` store binding ([#758](https://github.com/TundraSoft/TundraLibs/issues/758)) ([c580a30](https://github.com/TundraSoft/TundraLibs/commit/c580a304db1227ade39a6c0658ac9df9c75a8202))
* **rapid:** tenant resolver and per-surface schemes on the pact binding ([#777](https://github.com/TundraSoft/TundraLibs/issues/777)) ([b940a74](https://github.com/TundraSoft/TundraLibs/commit/b940a741dd53c20894ebf149b264b29326fa4431))

## [0.8.4](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.8.3...rapid-v0.8.4) (2026-10-01)


### Documentation

* **rapid:** password hashing for pact on Cloudflare Workers ([#754](https://github.com/TundraSoft/TundraLibs/issues/754)) ([d7dc91d](https://github.com/TundraSoft/TundraLibs/commit/d7dc91dacdc7602b19e9887dbfb709a5a14548c7))

## [0.8.3](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.8.2...rapid-v0.8.3) (2026-09-27)


### Bug Fixes

* **rapid:** send a GET form's fields as the query string ([#729](https://github.com/TundraSoft/TundraLibs/issues/729)) ([d1be432](https://github.com/TundraSoft/TundraLibs/commit/d1be4328e593a8086c0bc3a34d9062a2419ebd54))

## [0.8.2](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.8.1...rapid-v0.8.2) (2026-09-27)


### Documentation

* **rapid:** map pact MFA_LOCKED to a 429 in a TOTP route ([#725](https://github.com/TundraSoft/TundraLibs/issues/725)) ([3cb0777](https://github.com/TundraSoft/TundraLibs/commit/3cb07773c125dcde85fdd832c7a7433da6fa3a30))

## [0.8.1](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.8.0...rapid-v0.8.1) (2026-09-26)


### Bug Fixes

* **global:** pass the Weekly Health deno-canary lane under TypeScript 7 ([#717](https://github.com/TundraSoft/TundraLibs/issues/717)) ([fee29d6](https://github.com/TundraSoft/TundraLibs/commit/fee29d6e7484b8d8010ecc81789fa939e0a29eb1))


### Documentation

* **rapid:** cover pact tenant-scoped checks and the Workers KV cacher ([#722](https://github.com/TundraSoft/TundraLibs/issues/722)) ([515cb87](https://github.com/TundraSoft/TundraLibs/commit/515cb872d08c0be2198c1b5a436a0e0974791f9f))

## [0.8.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.7.1...rapid-v0.8.0) (2026-09-22)


### Features

* **rapid:** the api surface is JSON always, and uiOnly becomes a route option ([#702](https://github.com/TundraSoft/TundraLibs/issues/702)) ([501b04a](https://github.com/TundraSoft/TundraLibs/commit/501b04a5f16d03b552632de32442df4c93b73ab7))

## [0.7.1](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.7.0...rapid-v0.7.1) (2026-09-20)


### Bug Fixes

* **rapid:** audit remediation — surface bypass, browser fetch, runtime loops, ETag fold, and the rest of the verified findings ([#695](https://github.com/TundraSoft/TundraLibs/issues/695)) ([724a660](https://github.com/TundraSoft/TundraLibs/commit/724a66085de8e1e758f5d70ffa9559e261af5fb2))

## [0.7.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.6.0...rapid-v0.7.0) (2026-09-19)


### Features

* **rapid:** a collection marker for routes, and expose the paging headers to browsers by default ([#693](https://github.com/TundraSoft/TundraLibs/issues/693)) ([5feff52](https://github.com/TundraSoft/TundraLibs/commit/5feff52b3d766f960d71157275ab23fd39e7e453))
* **rapid:** carry the paging key onto the socket result frame ([#691](https://github.com/TundraSoft/TundraLibs/issues/691)) ([debeb04](https://github.com/TundraSoft/TundraLibs/commit/debeb04c8ff12e243e89abf2ff6dd029c12e2aed))

## [0.6.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.5.0...rapid-v0.6.0) (2026-09-19)


### Features

* **rapid:** array content and a paging reply key, so a collection is the collection ([#689](https://github.com/TundraSoft/TundraLibs/issues/689)) ([76b1436](https://github.com/TundraSoft/TundraLibs/commit/76b1436c42d1c1907889bd3be462e4c09dd552e3))

## [0.5.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.4.0...rapid-v0.5.0) (2026-09-18)


### Features

* **rapid:** accept a list of paths on @Module prefix and the route decorators ([#687](https://github.com/TundraSoft/TundraLibs/issues/687)) ([cf24977](https://github.com/TundraSoft/TundraLibs/commit/cf24977f027d171c1bdddfd11c6b8e46f59c6184))


### Documentation

* point package READMEs at the wiki and fix the wiki sync dropping 68 pages ([#685](https://github.com/TundraSoft/TundraLibs/issues/685)) ([97810ec](https://github.com/TundraSoft/TundraLibs/commit/97810eced5073e3fc8da0f2b8be602f480966862))

## [0.4.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.3.1...rapid-v0.4.0) (2026-09-18)


### Features

* **rapid:** upload progress, in-flight state and double-submit guard in the UI runtime ([#682](https://github.com/TundraSoft/TundraLibs/issues/682)) ([383980c](https://github.com/TundraSoft/TundraLibs/commit/383980c8efcedf62033e87ee57fd89c34e5e10b6))

## [0.3.1](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.3.0...rapid-v0.3.1) (2026-09-17)


### Documentation

* **norm,rapid:** fix weekly-health consumer-install doc-check failures ([#679](https://github.com/TundraSoft/TundraLibs/issues/679)) ([d3562ae](https://github.com/TundraSoft/TundraLibs/commit/d3562ae467bd5b93b81e7414d9193bcb9cf015a2))

## [0.3.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.2.1...rapid-v0.3.0) (2026-09-13)


### Features

* **rapid:** rapid.agent.md split (modules/ui/pact), import norm's guide ([#670](https://github.com/TundraSoft/TundraLibs/issues/670)) ([ab66a39](https://github.com/TundraSoft/TundraLibs/commit/ab66a39b14626157011bc764920cfbecc092975e))

## [0.2.1](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.2.0...rapid-v0.2.1) (2026-09-09)


### Documentation

* **rapid:** prioritize the CLI over jsr add in Installation ([#660](https://github.com/TundraSoft/TundraLibs/issues/660)) ([e21f722](https://github.com/TundraSoft/TundraLibs/commit/e21f722e9fb30313eba4f59c5adbf7ab1f6fd7bc))

## [0.2.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.1.0...rapid-v0.2.0) (2026-09-09)


### ⚠ BREAKING CHANGES

* **rapid:** `rapid init` no longer accepts --runtime, --docker, or --github; ScaffoldAnswers dropped `runtime`/`docker`/`github`; scaffold() gained an optional third `normVersions` parameter.

### Features

* **rapid:** drop runtime prompt/Docker from init, fix norm integration ([#656](https://github.com/TundraSoft/TundraLibs/issues/656)) ([0095148](https://github.com/TundraSoft/TundraLibs/commit/009514876897100d1a13abe77f5c8f9ea94f1757))


### Documentation

* **norm,rapid:** document the CLI in both READMEs; fix release-PR guard ([#658](https://github.com/TundraSoft/TundraLibs/issues/658)) ([5421ddd](https://github.com/TundraSoft/TundraLibs/commit/5421ddda1e44967041114719703482eac756dc2b))

## 0.1.0 (2026-09-09)


### Features

* **rapid:** rAPId application framework, first release ([#653](https://github.com/TundraSoft/TundraLibs/issues/653)) ([aa76476](https://github.com/TundraSoft/TundraLibs/commit/aa76476f72ed5dd09969f6d3dfaad49c11315117))
