# Changelog

## [2.0.0](https://github.com/TundraSoft/TundraLibs/compare/restler-v1.1.3...restler-v2.0.0) (2026-08-18)


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

## [1.1.3](https://github.com/TundraSoft/TundraLibs/compare/restler-v1.1.2...restler-v1.1.3) (2026-08-17)


### Bug Fixes

* **restler:** CUSTOM-auth signing, query encoding, FORM urlencoded, BASIC empty password, skipAuth, and responseSchema ([#345](https://github.com/TundraSoft/TundraLibs/issues/345)) ([3088a7d](https://github.com/TundraSoft/TundraLibs/commit/3088a7de9aebb5e97660fe18a80ed1a31d2f1d2f))

## [1.1.2](https://github.com/TundraSoft/TundraLibs/compare/restler-v1.1.1...restler-v1.1.2) (2026-08-14)


### Documentation

* **restler:** verify documentation examples and document the public API ([#247](https://github.com/TundraSoft/TundraLibs/issues/247)) ([cc50734](https://github.com/TundraSoft/TundraLibs/commit/cc507343e7eaf382d1c85a16e0f591fb34302673))

## [1.1.1](https://github.com/TundraSoft/TundraLibs/compare/restler-v1.1.0...restler-v1.1.1) (2026-08-12)


### Bug Fixes

* **utils:** harden Events and Options; adopt across the suite ([b32ffc4](https://github.com/TundraSoft/TundraLibs/commit/b32ffc4e9f9a4971070fd1a928141678d7cd4fce))

## [1.1.0](https://github.com/TundraSoft/TundraLibs/compare/restler-v1.0.1...restler-v1.1.0) (2026-08-09)


### Features

* **restler:** witness + headerProvider — the propagator hooks ([09e8968](https://github.com/TundraSoft/TundraLibs/commit/09e8968bcb20ad60a6eb017e602a3915be3be8c8))
* **restler:** witness + headerProvider propagator hooks ([c4f8442](https://github.com/TundraSoft/TundraLibs/commit/c4f844235f555cba164c1a8a12283811c48bd055))


### Documentation

* **restler:** self-consistent Observability example + RESTlerHooks type ([fb08d01](https://github.com/TundraSoft/TundraLibs/commit/fb08d01bdf3f099ac2ba9efd3e22388da542c078))

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/restler-v1.0.0...restler-v1.0.1) (2026-08-09)


### Documentation

* **restler:** add Observability section ([a5b4325](https://github.com/TundraSoft/TundraLibs/commit/a5b43251f05ad617167547420627d2cb6c1551e9))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/restler-v1.0.0-dev7...restler-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/restler-v1.0.0-dev6...restler-v1.0.0-dev7) (2026-07-27)


### Bug Fixes

* **restler:** redact URLs via function replacement so $-patterns can't re-insert credentials ([13afe25](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/13afe2556ef4ae600f57ddf93585915f8ccd7daf))

## [1.0.0-dev6](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/restler-v1.0.0-dev5...restler-v1.0.0-dev6) (2026-07-25)


### Bug Fixes

* **restler:** resolve round-3 review findings ([0a95ed5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0a95ed52d8d25c4b98e6f153b8bba333aee0c54e))
* **restler:** resolve round-4 review findings ([fed081f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/fed081fec8a47e6d0a65dd117c7c61f1621e1f39))
* **restler:** resolve round-5 review findings ([59360ad](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/59360ad9715ac295357de4b65e0dd1608045b778))
* **restler:** scrub request URL from wrapped fetch error cause chain ([8e495b6](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8e495b6e143ceec4f7f4a3a65373dbd6f2f74494))

## [1.0.0-dev5](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/restler-v1.0.0-dev1...restler-v1.0.0-dev5) (2026-07-23)


### Bug Fixes

* **restler:** close re-review findings — redact request payload, UTF-8 BASIC auth ([7461081](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/746108183d0fd2398c3f39df7c44d2374306f3e5))
* **restler:** close review findings — credential redaction, validation parity, dep skew ([7f967a9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7f967a95d9e44bb6f1ddb0f3f7cc00db2760813c))
* **restler:** release timeout timer on completion; validate endpoint version/contentType ([3d57c7a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3d57c7aac39df253f7cb491b402c493958103067))

## [1.0.0-dev1](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/restler-v1.0.0-dev0...restler-v1.0.0-dev1) (2026-07-14)


### Features

* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))
* **restler:** vendor response handler, real auth union, binary responses ([1febc83](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1febc83ab99ff14e89e27146f5029e958efc8147))


### Bug Fixes

* **global:** patch vulnerable deps, track lockfiles, fix $xml jsr alias ([0697998](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/069799849633c3e9abc96071a77618a2cfcfbe77))
* node test-suite compatibility (restler deps, doctor gates, crypt invariant) ([9b433e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9b433e461bcff072c99addd5d35fcf4008eaa9ec))
* **restler:** add stub mod.ts, sync package exports, drop misleading version ([b49a1aa](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b49a1aa51456413bb1ce6e1c7b033f6eb04216b0))
* **restler:** Handle restler ([65b7f0e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/65b7f0ed7d1c613928eb619ddf64ba64b01f0f39))


### Refactoring

* **compat:** camelCase the websocket codecs helper file ([ac29066](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ac29066daabf0134e81a31fd688523968dcae680))
* **restler:** __-prefix private field in test fixture ([fb80030](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/fb80030fa758dbd367c0c838b4ee0d5bd624d220))
* **restler:** name error-class files after their identifier ([57f5de5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/57f5de5b4b7823b405de5d7817a61231bdf4dac4))
* **restler:** name exported-type files after their identifier ([5322e27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5322e27d36a57a283228ed7b56207821f2b4a7eb))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
