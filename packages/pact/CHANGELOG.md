# Changelog

## [0.4.6](https://github.com/TundraSoft/TundraLibs/compare/pact-v0.4.5...pact-v0.4.6) (2026-08-15)


### Bug Fixes

* **compat:** path fallback, barrel test leak, and the udpSocket hang on Workers ([#283](https://github.com/TundraSoft/TundraLibs/issues/283)) ([317fc0f](https://github.com/TundraSoft/TundraLibs/commit/317fc0fdbaae712ed913a40f70852188508f0e0f))

## [0.4.5](https://github.com/TundraSoft/TundraLibs/compare/pact-v0.4.4...pact-v0.4.5) (2026-08-14)


### Documentation

* **pact:** verify documentation examples and document the public API ([#245](https://github.com/TundraSoft/TundraLibs/issues/245)) ([3ad43ad](https://github.com/TundraSoft/TundraLibs/commit/3ad43ad58897a5b5f3465d7940df96a1c0dc2d5e))

## [0.4.4](https://github.com/TundraSoft/TundraLibs/compare/pact-v0.4.3...pact-v0.4.4) (2026-08-13)


### Bug Fixes

* **pact:** import compat via subpaths instead of the root barrel ([f9a71e7](https://github.com/TundraSoft/TundraLibs/commit/f9a71e76c1dcb87c7e0b6a997f0165a67858accf))

## [0.4.3](https://github.com/TundraSoft/TundraLibs/compare/pact-v0.4.2...pact-v0.4.3) (2026-08-12)


### Bug Fixes

* **utils:** harden Events and Options; adopt across the suite ([b32ffc4](https://github.com/TundraSoft/TundraLibs/commit/b32ffc4e9f9a4971070fd1a928141678d7cd4fce))

## [0.4.2](https://github.com/TundraSoft/TundraLibs/compare/pact-v0.4.1...pact-v0.4.2) (2026-08-09)


### Documentation

* **pact:** remove stale unpublished-status banner ([#161](https://github.com/TundraSoft/TundraLibs/issues/161)) ([4b963d0](https://github.com/TundraSoft/TundraLibs/commit/4b963d09a3f81d571561e070a44b501168c8f929))

## [0.4.1](https://github.com/TundraSoft/TundraLibs/compare/pact-v0.4.0...pact-v0.4.1) (2026-08-09)


### Documentation

* **pact:** add Observability section ([b5372fd](https://github.com/TundraSoft/TundraLibs/commit/b5372fd6666526928c02ba45ec6e6edf153fd2d0))

## [0.4.0](https://github.com/TundraSoft/TundraLibs/compare/pact-v0.3.3...pact-v0.4.0) (2026-08-09)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [0.3.3](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.3.2...pact-v0.3.3) (2026-07-28)


### Documentation

* **pact:** correct the sync event's fires-when description ([58800b5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/58800b5d86280752591f4d132f3dec60889dc002))

## [0.3.2](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.3.1...pact-v0.3.2) (2026-07-27)


### Bug Fixes

* **pact:** enforce RFC 7518 per-algorithm HMAC secret minimums (HS384&gt;=48B, HS512&gt;=64B) ([04c02e6](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/04c02e6617e2c45d122f8a3664709cb4e22b8728))


### Documentation

* **pact:** document per-algorithm HMAC secret minimums (companion to [#208](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/208)) ([3d0c3be](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3d0c3be83f125b0e8337a009a402b9491a694b29))

## [0.3.1](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.3.0...pact-v0.3.1) (2026-07-25)


### Bug Fixes

* **pact:** resolve round-3 review findings ([24fd7b1](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24fd7b1f36a3ac82f320eb2b3a8c04494be29d73))
* **pact:** resolve round-4 review findings ([ca10d7a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ca10d7a456c8c4ed07b3662864ce72fc985e8e3f))
* **pact:** resolve round-6 review findings ([3e5f263](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3e5f263d06dc7a1156acb8d578bd998c98ab2c03))


### Documentation

* **pact:** align docs with round-3 isolation and OAuth-subject fixes ([8469d16](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8469d167d77e74b6df22b97645446a18480f2074))

## [0.3.0](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.2.0...pact-v0.3.0) (2026-07-23)


### Features

* **pact:** verify OIDC id_token signatures via JWKS ([65cf623](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/65cf6235eb5e929b057702d7965f6f6b307e1d29))


### Bug Fixes

* **pact:** close re-review findings — prototype-safe Permissions map ([e44159c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e44159c0506c3e6e13cd557324b4d4bca5852163))
* **pact:** close review findings — isolate success-event listeners, null-proto grants, OAuthClient rename ([5b6aeb9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5b6aeb9ce99c774aba5a5f2521d326eea187318a))
* **pact:** close review findings — success-event isolation, null-proto grants, OAuthClient rename ([8f98dcc](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8f98dcc4fbf211d30b24412f493e62ebdf8b603b))


### Refactoring

* **pact:** delegate id_token verification to crypt ([c070395](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c0703952b8607b3da89cfd2b3fc59fdddbf7633f))


### Documentation

* **pact:** mark the JWKS gap closed in DESIGN.md ([94b0947](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/94b0947049464565623c79eb9621a4146fa763d2))
* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [0.2.0](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.1.0...pact-v0.2.0) (2026-07-14)


### Features

* **pact:** authentication & authorization kernel (+ crypt HKDF) ([07e6ab4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/07e6ab4ca82b45bb2d581c2b3ca3ae74c2ee2e4f))
* **pact:** implement authentication & authorization kernel ([b559e1a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b559e1ab76551ce11a5021d85a4a31719d0340c6))
