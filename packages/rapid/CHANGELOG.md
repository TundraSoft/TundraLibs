# Changelog

## [0.15.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.14.0...rapid-v0.15.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* **rapid:** in DEVELOPMENT an app with a data route that declares no `response` no longer boots. Declare one on each route, or set `server.requireResponse: false`.
* **rapid:** in DEVELOPMENT an app with a data route that declares no `response` no longer boots. Declare one on each route, or set `server.requireResponse: false`.

### Features

* **rapid:** every data route declares what it answers with ([#918](https://github.com/TundraSoft/TundraLibs/issues/918)) ([3ae3289](https://github.com/TundraSoft/TundraLibs/commit/3ae3289d33c4a0775ee44e7b98180bcaf5701275))
* **rapid:** keep hand-written lines in the modules barrel ([#866](https://github.com/TundraSoft/TundraLibs/issues/866)) ([bafbbe5](https://github.com/TundraSoft/TundraLibs/commit/bafbbe534e85eed447e44eb6159620ef2c5d20c2))
* **rapid:** rapid sdk calls a public route without the credential ([#902](https://github.com/TundraSoft/TundraLibs/issues/902)) ([c921794](https://github.com/TundraSoft/TundraLibs/commit/c921794408d1d86f7eac5ed366f1a6d30cdedc38))
* **rapid:** rapid sdk declares each schema once and derives the rest with guardian ([#907](https://github.com/TundraSoft/TundraLibs/issues/907)) ([0679614](https://github.com/TundraSoft/TundraLibs/commit/0679614fd16e323a51fac353315ddcb0ddefb6c6))
* **rapid:** rapid sdk returns a collection's paging window with its items ([#906](https://github.com/TundraSoft/TundraLibs/issues/906)) ([5f68f3f](https://github.com/TundraSoft/TundraLibs/commit/5f68f3fc9c76a495f1cc4d1289228713054f97d4))
* **rapid:** rapid sdk turns header binds into a headers argument ([#901](https://github.com/TundraSoft/TundraLibs/issues/901)) ([ecae351](https://github.com/TundraSoft/TundraLibs/commit/ecae351edff42292abeba3dcb867ffa94b97ebb8))
* **rapid:** rapid sdk writes a typed RESTler client for the app's API ([#883](https://github.com/TundraSoft/TundraLibs/issues/883)) ([582eaef](https://github.com/TundraSoft/TundraLibs/commit/582eaef4599a4e4e50a5f80bf6292b6432c6e4c3))
* **rapid:** refuse an application option the app does not have ([#919](https://github.com/TundraSoft/TundraLibs/issues/919)) ([a551056](https://github.com/TundraSoft/TundraLibs/commit/a551056af66862d43ae67c8ec569a89f8ea17c02))
* **rapid:** schedule jobs in a named time zone ([#858](https://github.com/TundraSoft/TundraLibs/issues/858)) ([8bd8ecb](https://github.com/TundraSoft/TundraLibs/commit/8bd8ecbf62de0d32336c88b135647620a81c0d6f))
* **rapid:** shutdownSignals makes a signal stop the app, and the scaffold sets it ([#916](https://github.com/TundraSoft/TundraLibs/issues/916)) ([036f2b4](https://github.com/TundraSoft/TundraLibs/commit/036f2b4607f37147cec37550c9329484bf068614))


### Bug Fixes

* **drivers:** connect to a Postgres or Neon database whatever its time zone ([3a5c4f9](https://github.com/TundraSoft/TundraLibs/commit/3a5c4f9411992b88620a186420590e73e3ff7897))
* **drivers:** give a refused MariaDB or Postgres login its own error code ([3a5c4f9](https://github.com/TundraSoft/TundraLibs/commit/3a5c4f9411992b88620a186420590e73e3ff7897))
* **rapid:** a restarted app takes uploads again, and one with modules refuses to restart ([#910](https://github.com/TundraSoft/TundraLibs/issues/910)) ([712e219](https://github.com/TundraSoft/TundraLibs/commit/712e2196e4ce02fa57f377edc519b4262dfdc5f2))
* **rapid:** a stream reply that will never be sent is cancelled ([#914](https://github.com/TundraSoft/TundraLibs/issues/914)) ([1a24e6d](https://github.com/TundraSoft/TundraLibs/commit/1a24e6d10c71e57e89a2aee1ba2ab84165c3141c))
* **rapid:** an idempotency store that cannot save the record no longer fails the request ([#911](https://github.com/TundraSoft/TundraLibs/issues/911)) ([62d3a43](https://github.com/TundraSoft/TundraLibs/commit/62d3a43f39270db0b80375808b7600c7053b8739))
* **rapid:** close the route cache's access, key and reply gaps ([#909](https://github.com/TundraSoft/TundraLibs/issues/909)) ([3e65b9c](https://github.com/TundraSoft/TundraLibs/commit/3e65b9c5604e205b23a9fb8eaba72e0607293aee))
* **rapid:** name the non-UTC time zone opt-out in the scaffolded Norm.yaml ([#878](https://github.com/TundraSoft/TundraLibs/issues/878)) ([c3fa052](https://github.com/TundraSoft/TundraLibs/commit/c3fa0525affd7d799468b7023d2e85fdde98f262))
* **rapid:** the docs try-it sends no credential to a public operation ([#913](https://github.com/TundraSoft/TundraLibs/issues/913)) ([db92136](https://github.com/TundraSoft/TundraLibs/commit/db92136424c4a97f17b38d03931785263558507e))
* **rapid:** the scaffolded main.ts exports the app and starts only when run directly ([#915](https://github.com/TundraSoft/TundraLibs/issues/915)) ([548d89a](https://github.com/TundraSoft/TundraLibs/commit/548d89a3e9c4ee74f472884b9739adb7b4fc9331))


### Performance

* **rapid:** brand Html once on the prototype ([#922](https://github.com/TundraSoft/TundraLibs/issues/922)) ([538c963](https://github.com/TundraSoft/TundraLibs/commit/538c9631e67582dec43c21cbb42cff490c747301))
* **rapid:** build ctx.state on its first read ([#923](https://github.com/TundraSoft/TundraLibs/issues/923)) ([d5919ac](https://github.com/TundraSoft/TundraLibs/commit/d5919acce25c84ad86ba2ad7921836d01651f883))
* **rapid:** copy the response headers only when they are read ([#921](https://github.com/TundraSoft/TundraLibs/issues/921)) ([95389da](https://github.com/TundraSoft/TundraLibs/commit/95389daea3ab2108c062f032693db91e6c8b8976))
* **rapid:** import the signing key once ([#984](https://github.com/TundraSoft/TundraLibs/issues/984)) ([3f3fce0](https://github.com/TundraSoft/TundraLibs/commit/3f3fce0a7947acb8c950cf873d0667b2f66edcd2))
* **rapid:** parse the request body from the bytes already read ([#927](https://github.com/TundraSoft/TundraLibs/issues/927)) ([9f265ba](https://github.com/TundraSoft/TundraLibs/commit/9f265bae709d6aa242bfffcaedf8c4ee639e1994))
* **rapid:** re-issue the session cookie that was just verified ([#929](https://github.com/TundraSoft/TundraLibs/issues/929)) ([c801a86](https://github.com/TundraSoft/TundraLibs/commit/c801a8687007f69c3c1842aa9dec5e3d754c190f))
* **rapid:** read one outbound header without copying them all ([#925](https://github.com/TundraSoft/TundraLibs/issues/925)) ([ddd9754](https://github.com/TundraSoft/TundraLibs/commit/ddd97546334a2e138dfe40daad196cda1b256b8e))
* **rapid:** share one run among requests that miss the same cache key ([#924](https://github.com/TundraSoft/TundraLibs/issues/924)) ([1edfd94](https://github.com/TundraSoft/TundraLibs/commit/1edfd940474f9659765fe5e6dbaabe9b98f7d3a9))


### Documentation

* **rapid:** add the review's follow-ups to the roadmap ([#912](https://github.com/TundraSoft/TundraLibs/issues/912)) ([fea8a9d](https://github.com/TundraSoft/TundraLibs/commit/fea8a9db1937a192f52cee5320f21ec969e0aa83))
* **rapid:** drop shipped caching and metrics items from the roadmap ([#900](https://github.com/TundraSoft/TundraLibs/issues/900)) ([040169b](https://github.com/TundraSoft/TundraLibs/commit/040169ba9b10d301c8bf621f4ce3f87854d6754e))
* **rapid:** move the SSE live bridge under the cluster work in the roadmap ([#908](https://github.com/TundraSoft/TundraLibs/issues/908)) ([b7598de](https://github.com/TundraSoft/TundraLibs/commit/b7598deaabece584ace0f0e58c4e40709c745c48))
* **rapid:** show ctx.redirect in middleware as ctx.response ([#848](https://github.com/TundraSoft/TundraLibs/issues/848)) ([67c543a](https://github.com/TundraSoft/TundraLibs/commit/67c543aefa687aba43d31468df8f8c931939f0d4))
* **rapid:** tag the module testability sketch as not compiled ([#864](https://github.com/TundraSoft/TundraLibs/issues/864)) ([2f1e802](https://github.com/TundraSoft/TundraLibs/commit/2f1e80299a3160c4cec8ff32e651dc62b579bfc1))

## [0.14.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.13.0...rapid-v0.14.0) (2026-10-26)


### Features

* **rapid:** per-surface payload keys, csrf consume, per-surface response ([#831](https://github.com/TundraSoft/TundraLibs/issues/831)) ([85550fe](https://github.com/TundraSoft/TundraLibs/commit/85550fe4b14bacbc170105491c92d7f634f4a4a0))

## [0.13.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.12.1...rapid-v0.13.0) (2026-10-19)


### Features

* **rapid:** type the test client body and expose the raw text ([#800](https://github.com/TundraSoft/TundraLibs/issues/800)) ([f266ea8](https://github.com/TundraSoft/TundraLibs/commit/f266ea8bfda5e14ba035eb90d9cd7e89b72237e2)), closes [#799](https://github.com/TundraSoft/TundraLibs/issues/799)


### Bug Fixes

* **rapid:** load the agent guides and cover what agents re-implement ([#810](https://github.com/TundraSoft/TundraLibs/issues/810)) ([395370c](https://github.com/TundraSoft/TundraLibs/commit/395370cf1707ccd2e732c8754b5553642f5fb294))

## [0.12.1](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.12.0...rapid-v0.12.1) (2026-10-06)


### Bug Fixes

* **rapid:** a composed page that chooses no parts attaches none ([#787](https://github.com/TundraSoft/TundraLibs/issues/787)) ([0180552](https://github.com/TundraSoft/TundraLibs/commit/01805525732589825e64d62704bf9e7ff35876a3))

## [0.12.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.11.0...rapid-v0.12.0) (2026-10-05)


### Features

* **rapid:** composed pages choose their parts, and the route cache checks ctx.state reads ([#785](https://github.com/TundraSoft/TundraLibs/issues/785)) ([b5e9ab5](https://github.com/TundraSoft/TundraLibs/commit/b5e9ab5e1674cd786b68b017629b86137853288e))

## [0.11.0](https://github.com/TundraSoft/TundraLibs/compare/rapid-v0.10.0...rapid-v0.11.0) (2026-10-05)


### Features

* **rapid:** a composed part's error tells its template it is a part ([#782](https://github.com/TundraSoft/TundraLibs/issues/782)) ([6b6fb7f](https://github.com/TundraSoft/TundraLibs/commit/6b6fb7fc83291ab1484c0e280ae0b01d78cbd11b))

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
