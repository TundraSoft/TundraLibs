# Changelog

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/utils-v1.0.0-dev11...utils-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev11](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/utils-v1.0.0-dev10...utils-v1.0.0-dev11) (2026-07-28)


### Documentation

* **utils:** fix templatize + syslog documentation to match real behavior/API ([1602f08](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1602f08aabdda5361b9cd12785d4b18f5ee98133))
* **utils:** fix templatize + syslog documentation to match real behavior/API ([e18ec22](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e18ec22a33bcdc3c50a7537301d7e87602bab028))

## [1.0.0-dev10](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/utils-v1.0.0-dev9...utils-v1.0.0-dev10) (2026-07-27)


### Bug Fixes

* **utils:** parse year-first RFC3164 syslog timestamps with the correct year ([21684d5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/21684d579d52490ae3a77f771a31f8133219f217))
* **utils:** parse year-first RFC3164 syslog timestamps with the correct year ([40c14c7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/40c14c714ff03609e0616ad27ff3cc78d282615d))

## [1.0.0-dev9](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/utils-v1.0.0-dev8...utils-v1.0.0-dev9) (2026-07-25)


### Bug Fixes

* **utils:** resolve round-3 review findings ([5029388](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5029388d84075c924c9f815a15a49fc31288c179))
* **utils:** resolve round-3 review findings ([464ffa9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/464ffa98a3f4b70974ff408034f53bb1265e31de))
* **utils:** resolve round-4 review findings ([71193c2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/71193c28477cfbab882d743818ef9f946ac55d0e))
* **utils:** resolve round-4 review findings ([a925b74](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a925b747aa5e7d79cbdd40b8e33071092df3d826))
* **utils:** resolve round-6 review findings ([3e728ef](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3e728efde967beca3c72ef3e62fbe237aaad6a36))
* **utils:** resolve round-6 review findings ([fa5ae93](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/fa5ae93b5c8e2dd5956ade7deba9e7d0133d78b1))

## [1.0.0-dev8](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/utils-v1.0.0-dev7...utils-v1.0.0-dev8) (2026-07-23)


### Bug Fixes

* **utils:** asObject() returns a defensive copy for read-only PrivateObject ([ff05ef9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ff05ef91528669d248b899b8eec6b0a77ab29862))
* **utils:** asObject() returns a defensive copy for read-only PrivateObject ([cac9a37](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/cac9a375e5ba360955d0ba8a714aa9fa2e4b4e5d))
* **utils:** async memoize/@Once honor the Promise contract on cached calls ([4d2eefd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4d2eefde6ed8cfc3453f92d7793bab8b8f081f67))
* **utils:** close re-review findings — async memoize/@Once honor Promise contract ([9c71bfd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9c71bfd3748e29f4125bc3921836d83df6d479ee))
* **utils:** close review findings — decorator exports, SSRF ranges, validation-bypass leaks ([8b87f04](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8b87f04dd4c2a9d9643bee36496bff9db17fc318))
* **utils:** close review findings — decorator exports, SSRF ranges, validation-bypass leaks ([0daf2fc](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0daf2fca21499f51beaa4671b4831ff389e5cd1f))


### Documentation

* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/utils-v1.0.0-dev6...utils-v1.0.0-dev7) (2026-07-14)


### ⚠ BREAKING CHANGES

* **compat,utils:** act on Phase 0 consumer findings

### Features

* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* **compat,utils:** act on Phase 0 consumer findings ([6fab8f8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6fab8f81cc4f72a8e54a9becf44747d63f96c56d))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))
* **utils:** add protected _emit for variance-tolerant emission ([5ed7c58](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5ed7c58b47c1bb3d74385b22fa1ebbb8d4a66ae4))


### Bug Fixes

* **drivers,compat-sweep:** three audit bugs; cross-runtime testability ([4a3ff55](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4a3ff551482b02c4cfc94a30c0ae85ea5be0fb29))
* **global:** Formatting ([beb76e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/beb76e427ab0fa202f963705d58e329553aed456))
* **slogger:** make message interpolation opt-in; harden _lookup ([fd774e3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/fd774e38bfffbb4844352c1efae4274185a34d4b))
* **utils:** Add more tests ([3f6ec38](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3f6ec383893580402a5bbcc77a715bc812508934))
* **utils:** correct isPublicIP SSRF bypasses (link-local /10, IPv4-mapped, loopback) ([78ca0c7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/78ca0c7eb3c21a3dd92c5388405534def96bbdae))
* **utils:** Fix tests in BaseError and envArgs ([80ffae3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/80ffae3d1c0a975c0992c00b016b5615d0e48f5d))
* **utils:** Format issues ([0071db6](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0071db64298c6a6d427644511c10f9a25b9a8cae))
* **utils:** Rename "Optional" to fit naming convention ([a0bdd81](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a0bdd819e5d5a71cf7b8a7ef0c3cbaceacd1da0b))
* **utils:** resolve high/medium review findings ([cfe5a91](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/cfe5a91695c624a36635f6f70218598ba6e33b32))
* **utils:** resolve no-explicit-any in templatize bench ([dbd943f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/dbd943f27303832b6ee7cceb2173bf3f361e2d59))
* **utils:** templatize / variableReplacer — Date / RegExp / function now render usefully ([49fcfde](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/49fcfdeb495bb56f7fa5405ab808f17218c4052c))
* **utils:** Update listen and connect changes ([0db71ff](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0db71ff7da75d62f8c1e60345a0ced7f4be30c90))


### Refactoring

* **utils:** consolidate template engine — templatize is now the ([60bc296](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/60bc2960ae93329a474b71beeee4707abb181611))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* rename [@tundrasoft](https://github.com/tundrasoft) → [@tundralibs](https://github.com/tundralibs) across all package docs; add cacher docs ([5f7fffd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5f7fffdb410a6fa199a77231b304cdb4245158a0))
* **utils:** trim AI-generated doc bloat — keep wiki-sync structure ([dad163e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/dad163e501f6b3ab5b3be6c766ae0d21413c4b8d))
* **utils:** Update documentation ([436edf8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/436edf80fe2c60e78e1ea6887ece9dd8a466c1f6))
