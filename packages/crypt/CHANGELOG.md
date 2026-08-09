# Changelog

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/crypt-v1.0.0...crypt-v1.0.1) (2026-08-09)


### Bug Fixes

* **crypt:** bound the label length in PEM_ARMOUR too ([3e94ad9](https://github.com/TundraSoft/TundraLibs/commit/3e94ad9d0b595bf7ffd74730d866d44718b42e30))
* **crypt:** remove polynomial-ReDoS backtracking from PEM parsing ([541a405](https://github.com/TundraSoft/TundraLibs/commit/541a405e5bf70b7318015ec9d4497b0ab0099105))
* **crypt:** remove polynomial-ReDoS backtracking from PEM parsing ([7b38afc](https://github.com/TundraSoft/TundraLibs/commit/7b38afc30ec4fe3d676c223012c07a087615e36d))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/crypt-v1.0.0-dev12...crypt-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev12](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/crypt-v1.0.0-dev11...crypt-v1.0.0-dev12) (2026-07-28)


### Documentation

* **crypt:** fix non-exported import example + AES MAC description ([8791da5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8791da5c3d679fb9b7ad1417559551cf49051974))
* **crypt:** fix non-exported import example + AES MAC description ([1a1c0c3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1a1c0c3a50ab5c4b2934cf385d73e71d9c80f213))

## [1.0.0-dev11](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/crypt-v1.0.0-dev10...crypt-v1.0.0-dev11) (2026-07-27)


### Bug Fixes

* **crypt:** pbkdf2Verify returns false on malformed hash instead of throwing ([efcc1cd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/efcc1cd4f9ce7e31058992b8545c70bc72152040))
* **crypt:** pbkdf2Verify returns false on malformed hash instead of throwing ([0ce690f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0ce690f4c957f01d2cf45957df1e09205b08fc44))

## [1.0.0-dev10](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/crypt-v1.0.0-dev9...crypt-v1.0.0-dev10) (2026-07-25)


### Bug Fixes

* **crypt:** resolve round-3 review findings ([2e027a4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2e027a47e5a5954b124c436034131ca7162877e6))
* **crypt:** resolve round-3 review findings ([ba17be3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ba17be32e756d493b971ff7aca0c36b59b79c605))
* **crypt:** resolve round-4 review findings ([41189c6](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/41189c65f4ab9b505d9cc09d9befbec4d726ecf2))
* **crypt:** resolve round-4 review findings ([db67fd9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/db67fd9edf54005cd3cbd6faf094577ceccdbaa4))
* **crypt:** resolve round-6 review findings ([1b4b7f7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1b4b7f7844dd7123267b5d6a7f2fd2fb4890fc0e))
* **crypt:** resolve round-6 review findings ([2497bee](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2497beeddfd649e7810da18c6385dc847ee1c92e))

## [1.0.0-dev9](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/crypt-v1.0.0-dev8...crypt-v1.0.0-dev9) (2026-07-23)


### Features

* **crypt:** accept RFC 9068 typ values in verifyJWT ([9df39a3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9df39a380609ddf1f77596e008e637a37e498904))
* **crypt:** accept RFC 9068 typ values in verifyJWT ([aea29f2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/aea29f2b43fee0069919b91abad5f86a776ce8e1))
* **crypt:** add ECDSA (ES256/384/512) and accept CryptoKey/JWK keys ([fdf5aa2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/fdf5aa2450c4d4bce43d387e43de20f37e067013))
* **crypt:** add ECDSA (ES256/384/512) and accept CryptoKey/JWK keys ([569d092](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/569d092134551eb06754f54c6e774f6ef25f269a))


### Bug Fixes

* **crypt:** close re-review findings — BIP39 NFKD normalization, doc drift ([174f9d0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/174f9d0ecc1a250d24040fe994c7b6c6d0c9754b))
* **crypt:** close re-review findings — BIP39 NFKD normalization, doc drift ([6f81226](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6f812268931f3502d01a950efc5fedce12b29a80))
* **crypt:** close review findings — honest RSA sizing, OTP SHA-1 defaults, PS* refresh, 12-byte GCM nonce ([b457c8f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b457c8fbca02cdb4304c1f73ea560a4dff9c675a))
* **crypt:** close review findings — honest RSA sizing, OTP SHA-1 defaults, PS* refresh, 12-byte GCM nonce ([f6f5ef9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f6f5ef9c4232c569d75cc1a81129da03a44805d6))
* **crypt:** treat JWT typ as optional per RFC 7519 §5.1 ([4272b62](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4272b62af629e0acddea0f3978d7bf3c44333a6c))


### Documentation

* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [1.0.0-dev8](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/crypt-v1.0.0-dev7...crypt-v1.0.0-dev8) (2026-07-14)


### Features

* **crypt:** add HKDF (RFC 5869) key derivation ([f130e25](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f130e25037639ff0d6bd431a94a895551f014547))
* **pact:** authentication & authorization kernel (+ crypt HKDF) ([07e6ab4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/07e6ab4ca82b45bb2d581c2b3ca3ae74c2ee2e4f))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/crypt-v1.0.0-dev6...crypt-v1.0.0-dev7) (2026-07-14)


### Features

* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* **crypt:** expose PBKDF2 as a public hash function + password hash/verify ([b0dd75d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b0dd75db0adafae9e7bd0c4679d664015cdace95))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))


### Bug Fixes

* **crypt/encrypt:** replace zero-pad key derivation with PBKDF2-SHA-256 ([76592ba](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/76592ba77a8baa1a9b59c78071c34a308b964a67))
* **crypt/JWT:** prevent JWT algorithm-confusion attack in verifyJWT ([b087d4b](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b087d4bb38bb905f99a51ada2e6bf832c11af0d8))
* **crypt:** add some tests ([2d8ef1a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2d8ef1a67fa2f674f57e261651d52ff3c48b7103))
* **crypt:** authenticate AES-CBC/CTR via encrypt-then-MAC ([7fda45f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7fda45ffe6b6671b833a7524577e59ec983dbb41))
* **crypt:** emit JWT signatures as base64url (RFC 7515) ([84514c0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/84514c03deb32357f874d08951f265df778d84ea))
* **crypt:** make JWT RS* real PKCS[#1](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/1) v1.5 and add PS* (RSA-PSS) ([1e32905](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1e3290533eeea826b8dc666259acc432613b254d))
* **crypt:** resolve high/medium review findings ([9df7462](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9df74623401e02f07b79f29734cad4af7814fb18))
* **crypt:** Update tests for better coverage ([1a4a032](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1a4a0325461485ec5fdd06bdfa794d3148cb40ac))
* node test-suite compatibility (restler deps, doctor gates, crypt invariant) ([9b433e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9b433e461bcff072c99addd5d35fcf4008eaa9ec))


### Refactoring

* **crypt:** convention fixes — types/ folders + JWT/errors/ ([acd822b](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/acd822b5ddb5775158a3c6461b63669048129175))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* **non-wip:** strip \`[@since](https://github.com/since) 1.0.0\` from drivers/slogger/crypt/guardian/oql/cacher/id/hub ([4adf84d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4adf84d2a633bc2f016edd7384a657cf472af706))
* rename [@tundrasoft](https://github.com/tundrasoft) → [@tundralibs](https://github.com/tundralibs) across all package docs; add cacher docs ([5f7fffd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5f7fffdb410a6fa199a77231b304cdb4245158a0))
