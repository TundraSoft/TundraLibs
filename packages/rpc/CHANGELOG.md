# Changelog

## [1.1.0](https://github.com/TundraSoft/TundraLibs/compare/rpc-v1.0.2...rpc-v1.1.0) (2026-08-13)


### Features

* **rpc:** carry structured data on error result frames ([#231](https://github.com/TundraSoft/TundraLibs/issues/231)) ([64ab901](https://github.com/TundraSoft/TundraLibs/commit/64ab9014f9d08b00355aec3b6e4bf6cfaa06ef97))

## [1.0.2](https://github.com/TundraSoft/TundraLibs/compare/rpc-v1.0.1...rpc-v1.0.2) (2026-08-13)


### Refactoring

* **rpc:** move the pub/sub conformance harness off the public barrels ([#224](https://github.com/TundraSoft/TundraLibs/issues/224)) ([b696546](https://github.com/TundraSoft/TundraLibs/commit/b6965461ca06b369379d6ac042f22e21e2fe108d))

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/rpc-v1.0.0...rpc-v1.0.1) (2026-08-09)


### Documentation

* **rpc:** link the tracer middleware recipe ([1e4db7c](https://github.com/TundraSoft/TundraLibs/commit/1e4db7c88e0a26ad9b2196315bd8505019102ca0))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/rpc-v1.0.0-dev6...rpc-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev6](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/rpc-v1.0.0-dev5...rpc-v1.0.0-dev6) (2026-07-28)


### Bug Fixes

* **rpc:** correlate BAD_FORMAT error frames to the offending request id ([26439af](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/26439af1bd2fdc712a245efa4b7d08b9c01036e1))

## [1.0.0-dev5](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/rpc-v1.0.0-dev4...rpc-v1.0.0-dev5) (2026-07-27)


### Bug Fixes

* **rpc:** publish() normalizes undefined payload to null so the frame isn't rejected ([1dbae36](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1dbae36648d2b6b719bbf4fc905a7608144098df))

## [1.0.0-dev4](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/rpc-v1.0.0-dev3...rpc-v1.0.0-dev4) (2026-07-25)


### Bug Fixes

* **rpc:** resolve round-3 review findings ([09740f0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/09740f01985ee0886d6a731f75e21a1f1190ef8a))
* **rpc:** resolve round-4 review findings ([44ee873](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/44ee8736c073339d1dc8853f4bf13a94d90a7bb3))
* **rpc:** resolve round-5 review findings ([b2b41a9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b2b41a90155d0a67f5c521455f3efe5b303da9d4))


### Documentation

* README reconnect note + connect()/close() JSDoc. ([2ca62e9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2ca62e920db49b1b5ccb4bb9c94dd99846c0d53b))

## [1.0.0-dev3](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/rpc-v1.0.0-dev2...rpc-v1.0.0-dev3) (2026-07-23)


### Bug Fixes

* **rpc:** close re-review findings — re-check connection after authorize await ([f673ac3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f673ac3a6cbb3c5198cab0bebba12f93c1fc987e))
* **rpc:** close review findings — extension seams, error-path bugs, BaseError ([fcf6012](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/fcf601249b6b43e026e8cd854f0f5875f207623e))
* **rpc:** re-check connection after authorize await + close re-review doc/convention findings ([70c1cbe](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/70c1cbef2eca2fcb5af55b05a099e15261e7ca64))
* **rpc:** satisfy JSR slow-types after seam promotion ([9444354](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9444354e9d4d7fafc9fbf4221305a76006186273))


### Documentation

* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [1.0.0-dev2](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/rpc-v1.0.0-dev1...rpc-v1.0.0-dev2) (2026-07-14)


### ⚠ BREAKING CHANGES

* **rpc:** rename @tundralibs/hub → @tundralibs/rpc + HubServer → Server

### Features

* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))
* **rpc:** add Client with mirror-shape middleware ([1a5f74c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1a5f74c95825dcef3af429ef83067b1a6d2764b0))


### Bug Fixes

* **global:** CI step-0 — hermetic fetch tests, JSR publish-clean workspace ([0f00e5d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0f00e5df1b2e0068fdfc8592e6aed7b4ac36b93b))
* **global:** Formatting ([beb76e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/beb76e427ab0fa202f963705d58e329553aed456))
* **rpc:** resolve high/medium review findings ([eba2848](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/eba28480a79202bfbc86c0a84eaf3cf6ee2129cf))


### Refactoring

* **rpc:** __-prefix private field in example ([462b6f6](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/462b6f6ddff5600574cfbf824874f0400387c3af))
* **rpc:** protocol helpers camelCase, adapter matches its class ([1b70bda](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1b70bda4de5ae0e6629c81f9e5095cba4a4a09f0))
* **rpc:** split Types.ts + add errors + privacy prefix sweep ([9abc310](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9abc31047f37555984315ce0a8148c63abaa4f7a))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))


### Miscellaneous

* **rpc:** rename @tundralibs/hub → @tundralibs/rpc + HubServer → Server ([210bc59](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/210bc59a0e9bbf008fbdd3d09f99af39f35b0d05))
