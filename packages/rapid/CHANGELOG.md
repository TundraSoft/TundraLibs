# Changelog

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
