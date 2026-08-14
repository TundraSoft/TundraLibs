# Changelog

## [1.0.2](https://github.com/TundraSoft/TundraLibs/compare/radrouter-v1.0.1...radrouter-v1.0.2) (2026-08-14)


### Documentation

* **radrouter:** verify documentation examples and document the public API ([#237](https://github.com/TundraSoft/TundraLibs/issues/237)) ([6c1c477](https://github.com/TundraSoft/TundraLibs/commit/6c1c477112a3cd4ed721c1ede9ecace0288f4c91))

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/radrouter-v1.0.0...radrouter-v1.0.1) (2026-08-09)


### Documentation

* **radrouter:** link the tracer middleware recipe ([263917c](https://github.com/TundraSoft/TundraLibs/commit/263917c0bfd96a1cd7ade9ebb91ca959ed989c43))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/radrouter-v1.0.0-dev5...radrouter-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev5](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/radrouter-v1.0.0-dev4...radrouter-v1.0.0-dev5) (2026-07-28)


### Documentation

* **radrouter:** fix wrong capital sharp-S folding claim ([1ce7dda](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1ce7dda6c260aba9ac406be935fcc6a44e557145))

## [1.0.0-dev4](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/radrouter-v1.0.0-dev3...radrouter-v1.0.0-dev4) (2026-07-25)


### Bug Fixes

* **radrouter:** resolve round-3 review findings ([613f5aa](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/613f5aa33ab57f26f977099eaddae2707772580c))
* **radrouter:** resolve round-5 review findings ([e1ff223](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e1ff2230ac7e9d81d3c6663c154dd8d501f3da1c))

## [1.0.0-dev3](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/radrouter-v1.0.0-dev2...radrouter-v1.0.0-dev3) (2026-07-23)


### Bug Fixes

* **radrouter:** close re-review findings — length-preserving case-fold, example comment, conflict/clear coverage ([6b5aae5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6b5aae5d6a8816b1a44c68809629c563916a484d))
* **radrouter:** close review findings — greedy-suffix terminality, empty-path rejection, doc drift ([940520c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/940520c7a0564454500256c219a8ff2fdf73b0f4))

## [1.0.0-dev2](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/radrouter-v1.0.0-dev1...radrouter-v1.0.0-dev2) (2026-07-14)


### ⚠ BREAKING CHANGES

* **radrouter:** drop Ctx generic from Middleware; doc expansion
* **radrouter:** rename Router → RadRouter (class + files + docs)

### Features

* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))
* **radrouter, compat:** add Radrouter package + compat/http primitives ([c1164a0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c1164a055e56ff7c67a65ef7f3781098630cb330))


### Bug Fixes

* **global:** patch vulnerable deps, track lockfiles, fix $xml jsr alias ([0697998](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/069799849633c3e9abc96071a77618a2cfcfbe77))
* **radrouter:** four correctness fixes + doc + bench refresh ([472eb4c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/472eb4c7951fbcee24c458f5d60424ec3aafcb9e))
* **radrouter:** post-port stale-reference + doc cleanup ([8616810](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/86168101d776127025e80f4664366d0c25019093))
* **radrouter:** resolve high/medium review findings ([2880357](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/28803573673cfabe89b17bf7ddec0373ec237ac4))


### Refactoring

* **radrouter:** apply CONVENTIONS.md to the package ([a466224](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a46622463384fc27e0984031263cb6ca47c7167e))
* **radrouter:** drop Ctx generic from Middleware; doc expansion ([ebfebe8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ebfebe8385b4041ec44294da5883e45557350b94))
* **radrouter:** drop error codes — distinct classes are enough ([f72d6d8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f72d6d898c6233337d56af76791d10a9850ef831))
* **radrouter:** port compare bench to Deno.bench ([8dd48d9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8dd48d9d3579f11c166fd23dfeea948d68ef7bbc))
* **radrouter:** single re-export site at the package root ([71be202](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/71be2025d7fb15decb3f92f45d6d2ed1c2ee61ea))
* **radrouter:** split bench into Deno.bench + migrate stress tests ([b7fcd33](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b7fcd3391c8b655141b6bdea8b6a90bc1decd5b8))
* **radrouter:** typed error classes + SonarLint sweep ([feb4a56](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/feb4a56060f126b689319e7a870929fbb0642d4f))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* **radrouter:** add sample bench numbers from actual Deno.bench runs ([0b43d40](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0b43d4027eff01f6f10402e7e123cd2456e77e03))
* **radrouter:** Express + Oak integration examples ([24392e3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24392e3e425b103ffa0984c760dbac023c7742ed))


### Miscellaneous

* **radrouter:** rename Router → RadRouter (class + files + docs) ([1daf77f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1daf77f259154c213f88e620cdba27bbeb82e4f1))
