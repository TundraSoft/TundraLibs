# Changelog

## [1.1.1](https://github.com/TundraSoft/TundraLibs/compare/guardian-v1.1.0...guardian-v1.1.1) (2026-08-18)


### Documentation

* **guardian:** sync the package.json description, add a missing license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

## [1.1.0](https://github.com/TundraSoft/TundraLibs/compare/guardian-v1.0.3...guardian-v1.1.0) (2026-08-17)


### Features

* **guardian:** add .strict() coercion opt-out to NumberGuardian/BooleanGuardian ([#346](https://github.com/TundraSoft/TundraLibs/issues/346)) ([83d5aa0](https://github.com/TundraSoft/TundraLibs/commit/83d5aa041c8def1a43d49016989137cce778edd5)), closes [#337](https://github.com/TundraSoft/TundraLibs/issues/337)


### Bug Fixes

* **guardian:** encode instead of regex-strip in sanitize(), tighten noXss() ([#319](https://github.com/TundraSoft/TundraLibs/issues/319)) ([e2cf399](https://github.com/TundraSoft/TundraLibs/commit/e2cf399026315df4060fa1d6d3ba676480ea189b))


### Documentation

* **guardian:** add module docs to ./guards and ./types ([#312](https://github.com/TundraSoft/TundraLibs/issues/312)) ([e9c6b5d](https://github.com/TundraSoft/TundraLibs/commit/e9c6b5ddca80bbafaba8717b0afd532b0def1b9c))

## [1.0.3](https://github.com/TundraSoft/TundraLibs/compare/guardian-v1.0.2...guardian-v1.0.3) (2026-08-15)


### Bug Fixes

* **compat:** path fallback, barrel test leak, and the udpSocket hang on Workers ([#283](https://github.com/TundraSoft/TundraLibs/issues/283)) ([317fc0f](https://github.com/TundraSoft/TundraLibs/commit/317fc0fdbaae712ed913a40f70852188508f0e0f))

## [1.0.2](https://github.com/TundraSoft/TundraLibs/compare/guardian-v1.0.1...guardian-v1.0.2) (2026-08-14)


### Documentation

* **guardian:** verify documentation examples and document the public API ([#255](https://github.com/TundraSoft/TundraLibs/issues/255)) ([1fe5507](https://github.com/TundraSoft/TundraLibs/commit/1fe55075b6e95ef6aab7813fd5703aedf82173b5))

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/guardian-v1.0.0...guardian-v1.0.1) (2026-08-13)


### Documentation

* **guardian:** document Workers and browser runtime support ([#226](https://github.com/TundraSoft/TundraLibs/issues/226)) ([8aa5b19](https://github.com/TundraSoft/TundraLibs/commit/8aa5b194b5170a6b3fa41c7705ad80f401ec24cb))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/guardian-v1.0.0-dev11...guardian-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev11](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/guardian-v1.0.0-dev10...guardian-v1.0.0-dev11) (2026-07-28)


### Documentation

* **guardian:** fix object default-mode and nullable-fallback examples ([c5e0cb7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c5e0cb7a109a102f767cb4541cf390df4dc4c93e))

## [1.0.0-dev11](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/guardian-v1.0.0-dev10...guardian-v1.0.0-dev11) (2026-07-28)


### Documentation

* **guardian:** fix object default-mode and nullable-fallback examples ([c5e0cb7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c5e0cb7a109a102f767cb4541cf390df4dc4c93e))

## [1.0.0-dev10](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/guardian-v1.0.0-dev9...guardian-v1.0.0-dev10) (2026-07-27)


### Bug Fixes

* **guardian:** optional() function-default routes on callability, not 'then' presence ([d70da7c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d70da7c59521feea794b94d417132c652cb9fdf4))

## [1.0.0-dev9](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/guardian-v1.0.0-dev8...guardian-v1.0.0-dev9) (2026-07-25)


### Bug Fixes

* **guardian:** eliminate thenable-adoption idiom across all guards ([e4fe4a1](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e4fe4a19beb6d167307fa63d66a15b2bb5415bac))
* **guardian:** refuse thenable-shaped values on async parseAsync chains ([2aa23e3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2aa23e327ee1f2480f989420f161938e9afe074d))
* **guardian:** resolve round-3 review findings ([1a75cc7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1a75cc7e5360e8fc3cb3832064a6860c8bc9a8c4))
* **guardian:** resolve round-4 review findings ([bd0d024](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/bd0d02476778d48bd1345696f1a55cc1411784d7))
* **guardian:** resolve round-5 review findings ([5d10b00](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5d10b00a482c98d8519ceff0c3c8151cb7accd82))
* **guardian:** resolve round-6 review findings ([75bcb8c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/75bcb8c76b3a88a42bfb3e092b1a7d9fb55b8180))

## [1.0.0-dev8](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/guardian-v1.0.0-dev7...guardian-v1.0.0-dev8) (2026-07-23)


### Bug Fixes

* **guardian:** close re-review findings — nested async bypass, error secret leak, sync promise defaults, noSqlInjection ([2a4399a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2a4399a9c754934f56680ca470b8899d84fda23d))
* **guardian:** close review findings — async .test(), renameField, no-op transforms, errors/ move ([c64b009](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c64b009d1d0439e5b64293866fbd8eed98fb3e9f))
* **guardian:** Date transforms emit a schema matching their output type ([dd98a74](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/dd98a74c77b2885ec823b842b77265ef577643ab))
* **guardian:** DiscriminatedUnion _cloneWith carries the custom errorMessage ([4e0bf53](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4e0bf53a69d752dea5fdaff9f1c1d6c07c3da637))
* **guardian:** forbid refine() on FinishedGuardian at the type level ([9b35271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9b352715b60a979083e32fcb5f992123648fc844))
* **guardian:** implement formatCurrency/addCommas/padZeros for real ([0813436](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0813436322d71d8e7bbebbf6c73f3409ecf6ee37))
* **guardian:** make isoDateOnly/isoTimeOnly real validators ([20c4000](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/20c400032ab6a8ab3d569409e67566b9dc32791b))
* **guardian:** make ObjectGuardian.renameField actually rename ([6716900](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/67169009323c54174614a90b37e575c483fff0b3))
* **guardian:** mark chain async when .test() gets an async predicate ([4ede82c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4ede82c0f6b3a995427a54ce7ef51131a225b732))
* **guardian:** superRefine single-failure no longer self-references cause ([6b1011e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6b1011e08dc5a553fe100340f1a5f9371cda8b21))
* **guardian:** transform() preserves the catchall guardian ([78235df](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/78235dffc5a64b9cc48073e243ba9d37f09ef152))


### Refactoring

* **guardian:** move GuardianError into errors/ per CONVENTIONS.md ([7e815b1](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7e815b10665864973535b914daa80266a47f8446))


### Documentation

* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/guardian-v1.0.0-dev6...guardian-v1.0.0-dev7) (2026-07-14)


### ⚠ BREAKING CHANGES

* **guardian:** lift .refine() to BaseGuardian, drop subclass overrides
* **guardian:** brand + drop setters + ~40 new validators across guards
* **guardian:** chain methods immutable; drop .immutable()/.freeze() (BREAKING)
* **guardian:** refine() runs at declaration position; superRefine() accumulates (BREAKING)
* **guardian:** ObjectGuardian default = strip (BREAKING)
* **guardian:** coerce-by-default for all 5 primitive guards (BREAKING)

### Features

* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* **guardian,id:** Guardian.lazy + Guardian.intersection + id.cuid/cuid2 ([5fb6f23](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5fb6f2341431654f7ed22191ca1fe288f652a3ae))
* **guardian,slogger:** infer-as-type / tuple / record(1-arg) / LogContext ([1a9958d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1a9958d2dd775b325c6e4e93cc7149c6a2dfb1ec))
* **guardian:** brand + drop setters + ~40 new validators across guards ([40e7cf7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/40e7cf7a93b06361e8d3abce96ec902351558181))
* **guardian:** coerce-by-default for all 5 primitive guards (BREAKING) ([85e0f09](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/85e0f0923cf18a0f72697f344e3f2112b659b554))
* **guardian:** discriminatedUnion + literal + caseInsensitive enum ([b620f1d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b620f1d12cda35b4d571f4f8539682af328a2333))
* **guardian:** FinishedGuardian — compile-time enforcement of finisher rules ([f050daf](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f050daf6ad9b44790e261c2e8f8f0ad9730c8f14))
* **guardian:** Guardian.preprocess(fn, schema) ([f1aef94](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f1aef947e45fe7a9fa17bee05410bd9ed43b17f4))
* **guardian:** lift .refine() to BaseGuardian, drop subclass overrides ([8b8cd22](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8b8cd22ec05bdaa44654b9b00ae2547a34daec41))
* **guardian:** ObjectGuardian default = strip (BREAKING) ([3aa61c0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3aa61c09423b145b605043922adb18165eab2b71))
* **guardian:** ObjectGuardian.catchall(g) — fourth mode ([557f3fe](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/557f3fe430bbe9daccba901c951ef5c68ed303c9))
* **guardian:** path-tagged errors ([e39b474](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e39b474cf022d83c8b2485615a6e45b6919f6541))
* **guardian:** postalCode/emoji/encodeUri/decodeUri/unixSeconds/unixMillis + safeParse perf fix ([d2b5d95](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d2b5d952d72e78693ff291e9bee61b56a8269f1a))
* **guardian:** refine() runs at declaration position; superRefine() accumulates (BREAKING) ([6404141](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/64041417bef966ab3509374a0e55609ba40966c1))
* **guardian:** set / map / instanceof / never ([cab92ed](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/cab92eda1a95747e66a704c21b975a56b533dd7d))
* **guardian:** String.languageCode / latLngString / base58 / base32 ([4e1db68](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4e1db681a8ef071e6379843e5bb32cf59b445f26))
* **guardian:** toJSONSchema() — JSON Schema 2020-12 emit ([73545fa](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/73545fa762b2547646f74fd8e5bceb253825c755))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))


### Bug Fixes

* **guardian:** audit-driven correctness pass — close 5 latent bugs ([d092bcf](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d092bcfe2fde9399bd3737654cfca2ad41dbdd6e))
* **guardian:** Failing test case in date guardian ([b99f4fe](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b99f4fed5e458629d4d7d3f7e74b559bb1db9b8a))
* **guardian:** fill .optional(default) for absent object keys ([5798d21](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5798d21f93682896c812470eb1c4ddd6b9ee9f07))
* **guardian:** Fix format issues ([db333d1](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/db333d11f191022b503f291cd4ba9b1ccec7ead5))
* **guardian:** Fix infer issue and minor issue fixes ([ed00698](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ed0069825e3a867a16484cf696927f053d2b19f9))
* **guardian:** Fix ObjectGuardian issues and introduce RecordGuardian. Also update documentation ([32b6307](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/32b6307eda6da619e2c86d89641da9d20f8ef83e))
* **guardian:** nullable() returns T | null (not T | null | undefined); idempotent finishers ([a8abd8a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a8abd8ac1e9e13fc82a0779faeab68433f1c3658))
* **guardian:** resolve high/medium review findings ([4959832](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4959832cfaaeb1054c193e642e4625122c7ce4e4))
* set the versions ([ebc3855](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ebc385530b1b36a76fe003320fb9c54460ba0df4))


### Performance

* **guardian:** direct _composedTransform call per child element ([be057ac](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/be057ac23993206a77172004ba2d19420e728a28))
* **guardian:** precompute schema entries, sync parseAsync, lazy error, accumulating refinements ([94fbd91](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/94fbd91b335921882fcd65a3f74021901cf6169a))


### Refactoring

* **guardian:** align with CONVENTIONS.md (5 issues fixed) ([3d14f8d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3d14f8d6287497059c11116de1af7f6cb0569521))
* **guardian:** chain methods immutable; drop .immutable()/.freeze() (BREAKING) ([f728b3a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f728b3a58ef7033ba19684ffe4806e4abda4875b))
* **guardian:** name exported-type files after their identifier ([179328e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/179328eaddf2b1f9d73200266fa73e8d7437ce61))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* **guardian:** cover new features in Examples.md + Documentation.md ([ea42e70](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ea42e70e1dbcd40c333cd23f9450c0984f5ef9b0))
* **guardian:** document why .nullable() doesn't take a default ([f07a9da](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f07a9da702b097d97bbb9a3bcb4928ee80f54f34))
* **guardian:** full markdown rewrite + JSDoc pass ([1b181c9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1b181c90a14788d405a6bb245380dc42699925cc))
* **guardian:** refresh README + reference for new features ([9266353](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9266353c95a4364fe0e96dbaafba69f3ecf312bd))
* **non-wip:** strip \`[@since](https://github.com/since) 1.0.0\` from drivers/slogger/crypt/guardian/oql/cacher/id/hub ([4adf84d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4adf84d2a633bc2f016edd7384a657cf472af706))
* rename [@tundrasoft](https://github.com/tundrasoft) → [@tundralibs](https://github.com/tundralibs) across all package docs; add cacher docs ([5f7fffd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5f7fffdb410a6fa199a77231b304cdb4245158a0))
* **slogger,guardian:** code reviews — comparisons vs pino and zod ([d341638](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d341638f0fce138603280c77151609dfca62cf1f))
* **slogger,guardian:** correct review claims after running rigorous checks ([05e7fef](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/05e7fefbd0f67ff5f3897c3bbf78aad78e28d1b5))
