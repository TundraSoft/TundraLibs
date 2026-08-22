# Changelog

## [2.4.0](https://github.com/TundraSoft/TundraLibs/compare/compat-v2.3.0...compat-v2.4.0) (2026-08-22)


### Features

* **compat:** bounded graceful drain on WebServer.stop (G2) ([#527](https://github.com/TundraSoft/TundraLibs/issues/527)) ([e20d7e9](https://github.com/TundraSoft/TundraLibs/commit/e20d7e90725d8c2a6269cc0c58474d94461dd9f7))

## [2.3.0](https://github.com/TundraSoft/TundraLibs/compare/compat-v2.2.0...compat-v2.3.0) (2026-08-21)


### Features

* **compat:** add unrefTimer helper for cross-runtime timer unref ([#495](https://github.com/TundraSoft/TundraLibs/issues/495)) ([0f4b10e](https://github.com/TundraSoft/TundraLibs/commit/0f4b10eb0736aa091d6e62ba420bf235808facb7))

## [2.2.0](https://github.com/TundraSoft/TundraLibs/compare/compat-v2.1.1...compat-v2.2.0) (2026-08-21)


### Features

* **compat:** detect Cloudflare Workers and browsers; explicit UnsupportedRuntimeError on unavailable paths ([fadb7a8](https://github.com/TundraSoft/TundraLibs/commit/fadb7a8e2521f975d7bc810a6d06a7c23e4aa927))

## [2.1.1](https://github.com/TundraSoft/TundraLibs/compare/compat-v2.1.0...compat-v2.1.1) (2026-08-20)


### Bug Fixes

* **compat:** Bun FileHandle GC leak and Deno missing-path existence checks ([98810d2](https://github.com/TundraSoft/TundraLibs/commit/98810d2d60b0fd57a7435febdf22dad2105785f8))

## [2.1.0](https://github.com/TundraSoft/TundraLibs/compare/compat-v2.0.1...compat-v2.1.0) (2026-08-20)


### Features

* **compat:** cross-runtime bench harness and WebServer performance pass ([22b5000](https://github.com/TundraSoft/TundraLibs/commit/22b500054e77359902577e03b7830f2b100d47b6))

## [2.0.1](https://github.com/TundraSoft/TundraLibs/compare/compat-v2.0.0...compat-v2.0.1) (2026-08-19)


### Documentation

* **compat:** correct runtime/webserver/file/permissions doc claims that contradicted source ([#436](https://github.com/TundraSoft/TundraLibs/issues/436)) ([3917517](https://github.com/TundraSoft/TundraLibs/commit/3917517e5f3c7921f2078243270629f1952ce78c))
* **compat:** drop the phantom keyPassword TLS passphrase claim ([#442](https://github.com/TundraSoft/TundraLibs/issues/442)) ([de31897](https://github.com/TundraSoft/TundraLibs/commit/de31897a5fb759cb81e4882da3daa304409c504a))

## [2.0.0](https://github.com/TundraSoft/TundraLibs/compare/compat-v1.1.4...compat-v2.0.0) (2026-08-18)


### ⚠ BREAKING CHANGES

* **doctor:** rebuild injection on TC39 decorators and inject initializers

### Features

* **doctor:** rebuild injection on TC39 decorators and inject initializers ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))


### Bug Fixes

* **doctor:** resolve utils via narrow subpaths and document bundler targets ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **utils:** add a Singleton subpath export, mirroring BaseError ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **utils:** migrate Once, Memoize and Throttle to TC39 standard decorators ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))


### Documentation

* **ambient:** add a Cloudflare Workers badge and a browser incompatibility note ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **cacher:** sharpen the Browser/Worker compatibility section, sync the package.json description, add a missing license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **compat:** add a per-module Browser/Workers compatibility table, fix a missing package.json description and license ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **cronus:** document why there is no Browser/Workers badge, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **crypt:** add Browser and Cloudflare Workers badges, sync the package.json description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **doctor:** add Browser and Cloudflare Workers badges, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **drivers:** mention the edge/serverless HTTP dialects in the package description, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **guardian:** sync the package.json description, add a missing license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **id:** add Browser and Cloudflare Workers badges, add NanoID to the description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **metro-man:** add Browser and Cloudflare Workers badges, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **norm:** correct the Browser/Worker compatibility section, fix a stale unpublished package.json description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **oql:** fix description punctuation, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **pact:** add Browser and Cloudflare Workers badges, sync the package.json description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **radrouter:** add Browser and Cloudflare Workers badges, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **restler:** add Browser and Cloudflare Workers badges, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **rpc:** document why there is no Browser/Workers badge, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **slogger:** sharpen the Browser/Worker compatibility section, merge description wording, add a missing license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **tracer:** add Browser and Cloudflare Workers badges with a startActiveSpan caveat ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **utils:** add Browser and Cloudflare Workers badges, mention Singleton in the description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

## [1.1.4](https://github.com/TundraSoft/TundraLibs/compare/compat-v1.1.3...compat-v1.1.4) (2026-08-15)


### Bug Fixes

* **compat:** export InlineTLS and FileTLS so validateTLS stays callable ([#305](https://github.com/TundraSoft/TundraLibs/issues/305)) ([07decdc](https://github.com/TundraSoft/TundraLibs/commit/07decdc598b247f82d68167b3313b5b660e21f11))
* **compat:** path fallback, barrel test leak, and the udpSocket hang on Workers ([#283](https://github.com/TundraSoft/TundraLibs/issues/283)) ([317fc0f](https://github.com/TundraSoft/TundraLibs/commit/317fc0fdbaae712ed913a40f70852188508f0e0f))

## [1.1.3](https://github.com/TundraSoft/TundraLibs/compare/compat-v1.1.2...compat-v1.1.3) (2026-08-14)


### Documentation

* **compat:** verify documentation examples and document the public API ([#251](https://github.com/TundraSoft/TundraLibs/issues/251)) ([25de308](https://github.com/TundraSoft/TundraLibs/commit/25de3081db5b826e8112ca8f722247040f321a28))

## [1.1.2](https://github.com/TundraSoft/TundraLibs/compare/compat-v1.1.1...compat-v1.1.2) (2026-08-13)


### Bug Fixes

* **compat:** load node builtins synchronously instead of via top-level await ([1e48583](https://github.com/TundraSoft/TundraLibs/commit/1e48583cb314d24c503535b09fc8d524be67347a))

## [1.1.1](https://github.com/TundraSoft/TundraLibs/compare/compat-v1.1.0...compat-v1.1.1) (2026-08-12)


### Bug Fixes

* **utils:** harden Events and Options; adopt across the suite ([23d744c](https://github.com/TundraSoft/TundraLibs/commit/23d744c2025efd9735eec85627bcac04eb01ef3d))

## [1.1.0](https://github.com/TundraSoft/TundraLibs/compare/compat-v1.0.0...compat-v1.1.0) (2026-08-09)


### Features

* **compat:** report the actual bound port on WebServer ([3507c3d](https://github.com/TundraSoft/TundraLibs/commit/3507c3d9391ac8ec4e379ebad69e011ee880ce7f))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/compat-v1.0.0-dev10...compat-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev10](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/compat-v1.0.0-dev9...compat-v1.0.0-dev10) (2026-07-28)


### Bug Fixes

* **compat:** value-export WebServer from root barrel; fix broken doc examples ([541dd62](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/541dd620394875b0a61535191b268d1565bb339a))

## [1.0.0-dev9](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/compat-v1.0.0-dev8...compat-v1.0.0-dev9) (2026-07-25)


### Bug Fixes

* **compat:** correct malformed-Host docs to match per-runtime behavior ([2815119](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/281511946de681887a602940c1542744f4622540))
* **compat:** resolve round-3 review findings ([7e7da05](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7e7da05b64eb24e7172e957c7185578e3fce6684))
* **compat:** resolve round-4 review findings ([ae7c2c9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ae7c2c929822632ce816a4ecc788201c9267fcd4))

## [1.0.0-dev8](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/compat-v1.0.0-dev7...compat-v1.0.0-dev8) (2026-07-23)


### Bug Fixes

* **compat:** close re-review findings — doc drift, write byte count, WS avg metric, abort cleanup, Deno TLS parity ([1340300](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/13403006e629bc8ce6458f471d0962c59a181999))
* **compat:** close re-review findings (doc drift, write byte count, WS metric, abort cleanup, Deno TLS parity) ([1927f9f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1927f9fc0b8c2def6097d62fa76c9543550a8046))
* **compat:** resolve 11 review findings (socket crash, silent failures, cross-runtime divergences) ([994443d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/994443d84c4ee0a10cc3c0a332d2d794e8633341))


### Documentation

* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/compat-v1.0.0-dev6...compat-v1.0.0-dev7) (2026-07-14)


### ⚠ BREAKING CHANGES

* **rpc:** rename @tundralibs/hub → @tundralibs/rpc + HubServer → Server
* **compat,utils:** act on Phase 0 consumer findings

### Features

* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* **compat,slogger:** UDP support — `udpSocket()` primitive + SyslogHandler UDP transport ([06ce265](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/06ce265aade23ac51feb70babf4c2b4fe659768c))
* **compat,utils:** act on Phase 0 consumer findings ([6fab8f8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6fab8f81cc4f72a8e54a9becf44747d63f96c56d))
* **compat:** add cli + watch modules, plus OS info / exit / memoryUsage in runtime ([1b8fed8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1b8fed809d9da88c99589905949e4a05714e0506))
* **compat:** Add support for Unix socket and TLS in connect and listen ([b3a8338](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b3a8338f37fbc754f58e191391f440ad0afd12a1))
* **compat:** Support timeout for connect. Support signal controller for both connect and listen ([4b519b0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4b519b0277b09667a1620ed5acd675afe8bca278))
* **compat:** WebSocket overhaul -- upgrade hook, T param, Node WS via ws ([77ea24c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/77ea24c9139293f05b965f0148d92b1d4257c8d9))
* **compat:** WebSocketServer -- command router + middleware + pub/sub ([74c04ac](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/74c04ac829562513ae57016eb40e80254587ffc9))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))
* **radrouter, compat:** add Radrouter package + compat/http primitives ([c1164a0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c1164a055e56ff7c67a65ef7f3781098630cb330))


### Bug Fixes

* **compat:** cast WebSocketData to BufferSource on Deno ws.send ([fcb8856](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/fcb8856c07c29922c5904a44df665b3fa7d76f44))
* **compat:** consoleSize() falls back to 80x24 on { 0, 0 } ([51de1a8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/51de1a8580def5331e0604e075108700951460d6))
* **compat:** Fix listen in bun ([6054fa2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6054fa25a5819d53c49987e2f07860da06d28f22))
* **compat:** Formatting ([7713236](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/77132366dcfeaf16d18b08ae3026899c40fcb6b0))
* **compat:** Improve code quality ([f976909](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f976909522724a2fb140774e950df88b9dca3ac2))
* **compat:** lint issues in net.ts and correct signal handlers in runtime.test.ts ([62d6066](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/62d6066eaa97712d34e0dcd8fca24aa567e56d5c))
* **compat:** Make listen and connect async so its compatible with node and bun ([f7fda85](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f7fda853cfd1d5907749c2b69ef6e13fa8e66dd9))
* **compat:** make package JSR-publishable (dev6) ([3be8869](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3be88696c71a11d4256329b93eefc5828c31a00a))
* **compat:** plug listener leak in wrapNodeSocket.read ([3dc30d4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3dc30d41916b3035f3241014361d5a68ee218bd1))
* **compat:** type ws event-callback params to drop no-explicit-any ([8371d0f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8371d0f4f8a22ea70c0dc11f3401427717790bb7))
* **compat:** unblock consumer deno check + annotate ws callbacks ([5a73c72](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5a73c72973f9e0cd084d529a9219bcbf1a1a6549))
* **global:** CI step-0 — hermetic fetch tests, JSR publish-clean workspace ([0f00e5d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0f00e5df1b2e0068fdfc8592e6aed7b4ac36b93b))
* **global:** Formatting ([beb76e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/beb76e427ab0fa202f963705d58e329553aed456))
* **global:** patch vulnerable deps, track lockfiles, fix $xml jsr alias ([0697998](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/069799849633c3e9abc96071a77618a2cfcfbe77))


### Refactoring

* **compat/webserver:** extract metric, adapter, TLS, and Fetch helpers ([ad3f40d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ad3f40deab931b6552feef2a1448a96753ff8494))
* **compat:** apply convention fixes ([#3](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/3), [#4](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/4), [#5](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/5), [#6](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/6)) — types/ split + file.ts privacy ([824ab5d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/824ab5ddc9c9d6eda78e2cbc17951fd4ff6ad3e3))
* **compat:** camelCase the websocket codecs helper file ([ac29066](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ac29066daabf0134e81a31fd688523968dcae680))
* **compat:** make TLSOptions mutually exclusive (inline vs file) ([9f43454](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9f43454ad0f46841b9e192749d7dd89ec4eb432e))
* **compat:** name webserver type files after their identifier ([035c42f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/035c42f8c8c75059b76050208d12456165cc5f4b))
* **compat:** rename Server class to WebServer ([8105870](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/81058703255d8d71e4858d37c765e2f85b192ebb))
* **compat:** rename server/ folder to webserver/ ([ed7a882](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ed7a8820e549257d44a8d5733d983a43b3e46959))
* **compat:** single-underscore the protected _resolveUpgrade ([c0c10e3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c0c10e35bbf0edcc7b9121828fa278c07ffc617f))
* **drivers,compat,cacher:** unify TLS surface, add upgradeTls + Postgres/Redis/Memcached TLS ([34023a5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34023a5ec1b43d34aaa29876ffb9f6243724bac5))
* **restler:** name exported-type files after their identifier ([5322e27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5322e27d36a57a283228ed7b56207821f2b4a7eb))


### Documentation

* **compat:** rename docs to convention; PascalCase websocket/{Protocol,Types}.ts ([8beb1ba](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8beb1ba4c0cdef3ef46a8952df7320dc258105c0))
* **compat:** trim AI doc bloat — keep wiki-sync structure ([81d5629](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/81d5629ceb721f01a5daa6e6837b62bacd41375e))
* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* rename [@tundrasoft](https://github.com/tundrasoft) → [@tundralibs](https://github.com/tundralibs) across all package docs; add cacher docs ([5f7fffd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5f7fffdb410a6fa199a77231b304cdb4245158a0))


### Miscellaneous

* **rpc:** rename @tundralibs/hub → @tundralibs/rpc + HubServer → Server ([210bc59](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/210bc59a0e9bbf008fbdd3d09f99af39f35b0d05))
