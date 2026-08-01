# Changelog

## [0.3.3](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.3.2...pact-v0.3.3) (2026-07-28)


### Documentation

* **pact:** correct the sync event's fires-when description ([58800b5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/58800b5d86280752591f4d132f3dec60889dc002))
* **pact:** correct the sync event's fires-when description ([53c9945](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/53c99450db2d09c8eb6c2e36acb5e865b1c456eb))

## [0.3.2](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.3.1...pact-v0.3.2) (2026-07-27)


### Bug Fixes

* **pact:** enforce RFC 7518 per-algorithm HMAC secret minimums (HS384&gt;=48B, HS512&gt;=64B) ([04c02e6](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/04c02e6617e2c45d122f8a3664709cb4e22b8728))
* **pact:** enforce RFC 7518 per-algorithm HMAC secret minimums (HS384&gt;=48B, HS512&gt;=64B) ([aedd5c3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/aedd5c30e904169ef01ebbb9bb664c15d93eabd6))


### Documentation

* **pact:** document per-algorithm HMAC secret minimums (companion to [#208](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/208)) ([3d0c3be](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3d0c3be83f125b0e8337a009a402b9491a694b29))
* **pact:** document per-algorithm HMAC secret minimums (companion to [#208](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/208)) ([23cc5c3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/23cc5c320d7c83227e3b4a38d2040c04bf7397a9))

## [0.3.1](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.3.0...pact-v0.3.1) (2026-07-25)


### Bug Fixes

* **pact:** resolve round-3 review findings ([24fd7b1](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24fd7b1f36a3ac82f320eb2b3a8c04494be29d73))
* **pact:** resolve round-3 review findings ([c28e00c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c28e00c00a791386f8e5e8dd5cb087ce395ed5f3))
* **pact:** resolve round-4 review findings ([ca10d7a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ca10d7a456c8c4ed07b3662864ce72fc985e8e3f))
* **pact:** resolve round-4 review findings ([d5f2222](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d5f222200b0e860d4dc6b17a47eb12d6d333329d))
* **pact:** resolve round-6 review findings ([3e5f263](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3e5f263d06dc7a1156acb8d578bd998c98ab2c03))
* **pact:** resolve round-6 review findings ([e2eb833](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e2eb833555ba4ef973517542d8ccbe920c5ebdf2))


### Documentation

* **pact:** align docs with round-3 isolation and OAuth-subject fixes ([8469d16](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8469d167d77e74b6df22b97645446a18480f2074))

## [0.3.0](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.2.0...pact-v0.3.0) (2026-07-23)


### Features

* **pact:** verify OIDC id_token signatures via JWKS ([65cf623](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/65cf6235eb5e929b057702d7965f6f6b307e1d29))
* **pact:** verify OIDC id_token signatures via JWKS ([30d90b7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/30d90b7945ba640501b6de13264ec582ee6ac190))


### Bug Fixes

* **pact:** close re-review findings — prototype-safe Permissions map ([e44159c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e44159c0506c3e6e13cd557324b4d4bca5852163))
* **pact:** close re-review findings — prototype-safe Permissions map ([f64dcc1](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f64dcc17159aae307456301b092d0397a08a862a))
* **pact:** close review findings — isolate success-event listeners, null-proto grants, OAuthClient rename ([5b6aeb9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5b6aeb9ce99c774aba5a5f2521d326eea187318a))
* **pact:** close review findings — success-event isolation, null-proto grants, OAuthClient rename ([8f98dcc](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8f98dcc4fbf211d30b24412f493e62ebdf8b603b))


### Refactoring

* **pact:** delegate id_token verification to crypt ([c070395](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c0703952b8607b3da89cfd2b3fc59fdddbf7633f))
* **pact:** delegate id_token verification to crypt ([23b712a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/23b712ab2f6aafc60c6ba9e87c68a7acca36c457))


### Documentation

* **pact:** mark the JWKS gap closed in DESIGN.md ([94b0947](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/94b0947049464565623c79eb9621a4146fa763d2))
* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [0.2.0](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/pact-v0.1.0...pact-v0.2.0) (2026-07-14)


### Features

* **pact:** authentication & authorization kernel (+ crypt HKDF) ([07e6ab4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/07e6ab4ca82b45bb2d581c2b3ca3ae74c2ee2e4f))
* **pact:** implement authentication & authorization kernel ([b559e1a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b559e1ab76551ce11a5021d85a4a31719d0340c6))
