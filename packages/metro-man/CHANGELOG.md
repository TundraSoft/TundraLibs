# Changelog

## [1.0.6](https://github.com/TundraSoft/TundraLibs/compare/metro-man-v1.0.5...metro-man-v1.0.6) (2026-08-21)


### Refactoring

* **metro-man:** surface Series types and document Workers/browser support ([#500](https://github.com/TundraSoft/TundraLibs/issues/500)) ([e87481c](https://github.com/TundraSoft/TundraLibs/commit/e87481c1e55404a2fde588f6251907644e1488b3))

## [1.0.5](https://github.com/TundraSoft/TundraLibs/compare/metro-man-v1.0.4...metro-man-v1.0.5) (2026-08-18)


### Documentation

* **metro-man:** add Browser and Cloudflare Workers badges, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

## [1.0.4](https://github.com/TundraSoft/TundraLibs/compare/metro-man-v1.0.3...metro-man-v1.0.4) (2026-08-17)


### Documentation

* **metro-man:** add module docs to ./errors and ./types ([#313](https://github.com/TundraSoft/TundraLibs/issues/313)) ([1208721](https://github.com/TundraSoft/TundraLibs/commit/1208721a6787d197d2e2de2c4324402836df01e7))

## [1.0.3](https://github.com/TundraSoft/TundraLibs/compare/metro-man-v1.0.2...metro-man-v1.0.3) (2026-08-14)


### Documentation

* **metro-man:** verify documentation examples and document the public API ([#239](https://github.com/TundraSoft/TundraLibs/issues/239)) ([8492c50](https://github.com/TundraSoft/TundraLibs/commit/8492c50a648ad31824b2cecd076ab1d196dddc1b))

## [1.0.2](https://github.com/TundraSoft/TundraLibs/compare/metro-man-v1.0.1...metro-man-v1.0.2) (2026-08-12)


### Bug Fixes

* **utils:** harden Events and Options; adopt across the suite ([b32ffc4](https://github.com/TundraSoft/TundraLibs/commit/b32ffc4e9f9a4971070fd1a928141678d7cd4fce))

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/metro-man-v1.0.0...metro-man-v1.0.1) (2026-08-09)


### Documentation

* **metro-man:** cross-link the sibling observability pillars ([2ded4b1](https://github.com/TundraSoft/TundraLibs/commit/2ded4b1148c221ef33b199e0e462dfff3785a5fd))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/metro-man-v1.0.0-dev7...metro-man-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/metro-man-v1.0.0-dev6...metro-man-v1.0.0-dev7) (2026-07-28)


### Bug Fixes

* **metro-man:** de-duplicate histogram buckets / summary quantiles ([67d9000](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/67d9000894cfcc09e8a56c34de48e5741bc556c6))

## [1.0.0-dev6](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/metro-man-v1.0.0-dev5...metro-man-v1.0.0-dev6) (2026-07-27)


### Bug Fixes

* **metro-man:** de-duplicate collect() selection list so families aren't emitted twice ([de57c54](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/de57c54475d342d62afd9163711f4dcf6ad89e43))


### Documentation

* **metro-man:** note collect() de-duplicates a repeated selection name ([2fc3c62](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2fc3c620089e51e288eaced6b4dc1c4e227118af))

## [1.0.0-dev5](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/metro-man-v1.0.0-dev4...metro-man-v1.0.0-dev5) (2026-07-25)


### Bug Fixes

* **metro-man:** resolve round-3 review findings ([53c7e3d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/53c7e3dbae699c15db4dd7942e7a2904697f6e6f))
* **metro-man:** resolve round-4 review findings ([d5295f8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d5295f882a6d0474c2076e3c26577b7e5b83b508))
* **metro-man:** resolve round-5 review findings ([023edbd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/023edbde2b021b35c0cb90e917f3617f89264be0))
* **metro-man:** terminate Prometheus exposition with a trailing line feed ([448a109](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/448a1099f352aec6e2e2d1d379e967aa8fc54923))


### Documentation

* README notes the PROMETHEUS output is LF-terminated; JSDoc updated. ([448a109](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/448a1099f352aec6e2e2d1d379e967aa8fc54923))

## [1.0.0-dev4](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/metro-man-v1.0.0-dev3...metro-man-v1.0.0-dev4) (2026-07-23)


### Bug Fixes

* **metro-man:** close re-review findings — reject non-finite Summary window ([a8ad297](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a8ad29788220a0352a70a8135a60cedf0078f09f))
* **metro-man:** close review findings — validation, bounded retention, ordering ([1c3c82a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1c3c82a77b57869689743ec547a48ab8f2341bb8))
* **metro-man:** make Summary _sum/_count cumulative (Prometheus semantics) ([e176a1b](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e176a1bda80a8ba52bb51e853cf35db08abbf9ae))
* **metro-man:** reject non-finite Summary window and Histogram buckets ([2592c89](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2592c895c6cc002d28ab254b54e1c5d5b8b86cb7))

## [1.0.0-dev3](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/metro-man-v1.0.0-dev2...metro-man-v1.0.0-dev3) (2026-07-14)


### Features

* **metro-man:** rebuild on new conventions + fix correctness bugs ([63420fb](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/63420fb7229b36a0a5c6bd94c8904b873d69a777))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))


### Bug Fixes

* **metro-man:** explicit type on Summary._lastPurge for JSR + fmt ([60727b0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/60727b02269f105d13462f6adc12754eaec7684d))
* **metro-man:** resolve high/medium review findings ([3435174](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3435174a0ce995f02d341679b67582539fde9ed1))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* **metro-man:** correct Summary behavior/example + fill API gaps ([e88e3e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e88e3e4798943558f408bcf06fc531a00e6a9fa9))
