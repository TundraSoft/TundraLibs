# Changelog

## [1.1.0](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.8...drivers-v1.1.0) (2026-08-20)


### Features

* **compat:** cross-runtime bench harness and WebServer performance pass ([22b5000](https://github.com/TundraSoft/TundraLibs/commit/22b500054e77359902577e03b7830f2b100d47b6))

## [1.0.8](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.7...drivers-v1.0.8) (2026-08-19)


### Documentation

* **drivers:** correct stale pool-design description in PERFORMANCE.md ([#430](https://github.com/TundraSoft/TundraLibs/issues/430)) ([17d23e7](https://github.com/TundraSoft/TundraLibs/commit/17d23e758a2a8b13e3dc400deb285bd2a1ded366))

## [1.0.7](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.6...drivers-v1.0.7) (2026-08-18)


### Documentation

* **drivers:** mention the edge/serverless HTTP dialects in the package description, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

## [1.0.6](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.5...drivers-v1.0.6) (2026-08-17)


### Documentation

* **drivers:** add module docs and symbol JSDoc to engine entrypoints ([#318](https://github.com/TundraSoft/TundraLibs/issues/318)) ([9a787a7](https://github.com/TundraSoft/TundraLibs/commit/9a787a7246cc3fd44c42ec67a3ba3a3873dbab18))

## [1.0.5](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.4...drivers-v1.0.5) (2026-08-15)


### Bug Fixes

* **compat:** path fallback, barrel test leak, and the udpSocket hang on Workers ([#283](https://github.com/TundraSoft/TundraLibs/issues/283)) ([317fc0f](https://github.com/TundraSoft/TundraLibs/commit/317fc0fdbaae712ed913a40f70852188508f0e0f))
* **drivers:** move engines off the root barrel onto their subpaths ([#286](https://github.com/TundraSoft/TundraLibs/issues/286)) ([02d9d34](https://github.com/TundraSoft/TundraLibs/commit/02d9d343c51ddcf567394698531a3c72e15b28f5))


### Documentation

* note the extra install on cross-package examples ([#298](https://github.com/TundraSoft/TundraLibs/issues/298)) ([44e1eff](https://github.com/TundraSoft/TundraLibs/commit/44e1effee2ae174946e2cdb0356fbc12d8c9ed4a))

## [1.0.4](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.3...drivers-v1.0.4) (2026-08-14)


### Bug Fixes

* **drivers:** bound _processOption to keyof O for subclass option validation ([#241](https://github.com/TundraSoft/TundraLibs/issues/241)) ([99736fe](https://github.com/TundraSoft/TundraLibs/commit/99736fe8ece08b3b4d5325e9358cdb36c9769ba8))

## [1.0.3](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.2...drivers-v1.0.3) (2026-08-13)


### Bug Fixes

* **drivers:** import compat via subpaths instead of the root barrel ([c6d66b0](https://github.com/TundraSoft/TundraLibs/commit/c6d66b0a70b6cff7ff9c7d7d2d9259ea10911421))
* **drivers:** stop redis/memcached engines importing the root barrel ([7066d91](https://github.com/TundraSoft/TundraLibs/commit/7066d914e9c3aad374a603e2b1c013dd1a48dcb9))

## [1.0.2](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.1...drivers-v1.0.2) (2026-08-12)


### Bug Fixes

* **utils:** harden Events and Options; adopt across the suite ([b32ffc4](https://github.com/TundraSoft/TundraLibs/commit/b32ffc4e9f9a4971070fd1a928141678d7cd4fce))

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.0...drivers-v1.0.1) (2026-08-09)


### Documentation

* **drivers:** document the event seam for tracing and metrics ([15016dd](https://github.com/TundraSoft/TundraLibs/commit/15016dd4752510634c6b2a289288cabf8f43ac8c))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/drivers-v1.0.0-dev11...drivers-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev11](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/drivers-v1.0.0-dev10...drivers-v1.0.0-dev11) (2026-07-28)


### Documentation

* **drivers:** fix error-handling examples to use the real engine API ([66168de](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/66168de8a89e4c81ecc9a883edde740416eee255))

## [1.0.0-dev10](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/drivers-v1.0.0-dev9...drivers-v1.0.0-dev10) (2026-07-27)


### Bug Fixes

* **drivers:** skip backtick and [bracket] identifiers in Bun placeholder rewrite ([98d88e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/98d88e5e9af5bb04c1284dd907b2e857f60c6e78))

## [1.0.0-dev9](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/drivers-v1.0.0-dev8...drivers-v1.0.0-dev9) (2026-07-25)


### Bug Fixes

* **drivers:** resolve round-3 review findings ([9e95777](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9e9577734633a7780ce2ff9fadd28a829fe4fe25))
* **drivers:** resolve round-4 review findings ([24ba320](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24ba320e5bdbe187950d7dd89fc48ca3cce7eb0e))

## [1.0.0-dev8](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/drivers-v1.0.0-dev7...drivers-v1.0.0-dev8) (2026-07-23)


### Bug Fixes

* **drivers:** close re-review findings — tx-timeout busy guard, SCRAM mutual-auth, memcached ttl=0 ([0f46673](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0f466732ab2440fd2f6cf08a38ba4b635bc9d469))
* **drivers:** close review findings — idle-eviction min floor, CAS injection, MULTI connection health ([71cdcfc](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/71cdcfc3a0e6cbe0ce19dfb82de623add0ed6ce5))
* **drivers:** close review findings — idle-eviction min floor, CAS injection, MULTI health ([4ae407c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4ae407c3d132bd653e39cac8c363471781fdb4ef))
* **drivers:** preserve RESP 64-bit integer precision; SASLprep SCRAM passwords ([2d2e0e9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2d2e0e9ebb23429ddb46456722c7a14e97e5002e))


### Documentation

* refine package descriptions (deno.json summaries) ([#55](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/55)) ([8325f27](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8325f2750e4591bd07ed4c0550f20f859e011a67))

## [1.0.0-dev7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/drivers-v1.0.0-dev6...drivers-v1.0.0-dev7) (2026-07-14)


### ⚠ BREAKING CHANGES

* **dam:** remove deprecated DAM package

### Features

* **cacher:** migrate Redis engine to use @tundralibs/drivers/redis ([0fbf096](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0fbf09698d9c018071c86ff54611af7363c65ce6))
* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* **drivers/mongo:** mirror SQL RETURNING on insert + upsert via re-fetch ([03ba2dc](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/03ba2dcfc1e0668f3e09dfebe7e0893539e13be6))
* **drivers/postgres:** binary parameter format ([da9cce9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/da9cce9f717511b644d8531aa31577138758e365))
* **drivers/sqlite:** file-per-schema directory mode + OQL schema support ([8858db4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8858db4ef2b55933639ea618dc30c48746b822c2))
* **drivers/sqlite:** per-connection prepared-statement cache ([e788519](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e78851963bb374115601a5d011f5475701ac08fe))
* **drivers/sqlite:** prefer Node built-in node:sqlite, fall back to better-sqlite3 ([3f8eb8d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3f8eb8db58bf3d1f427520e03c78e88879754cf6))
* **drivers:** add MongoDB driver wrapping npm:mongodb ([3c059ac](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3c059acc7ea1ab682f60444a8107069ac7701ed3))
* **drivers:** add Postgres driver written from scratch over wire protocol ([efdb7b8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/efdb7b8127beab8b2663d48d93913e1351ef2d8d))
* **drivers:** add Redis (RESP3 from scratch) and MariaDB drivers ([f4270fd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f4270fdca46376b9e83153e2d3cf30cb4fa891a0))
* **drivers:** add SQLEngine abstract layer + standardized error codes ([255b554](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/255b55466e4436828c4173d6a72fcc41a83378ce))
* **drivers:** add SQLite driver with runtime-branched adapter ([7bed294](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7bed294605bf0d845b69efc2a8a9d16d3dab1e64))
* **drivers:** callback-scoped transaction(fn) with nested savepoints ([5e18e3e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5e18e3eb686af74ee92530f4fcec6e5705ef618d))
* **drivers:** integrate OQL surface into SQLEngine + MongoEngine ([3d42f17](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3d42f17f2386cd32f19c406ee6137308cb149035))
* **drivers:** self-declared SQL capabilities + Cockroach/PlanetScale alias engines ([06168ac](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/06168ac96739e32c1ded44eadd6f0523a75b5890))
* **drivers:** SQLite ATTACH-in-tx guard via _canRunInTransaction hook ([d58529d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d58529d603cdc551bf606d3a84ff6b77b8829375))
* **drivers:** unify the engine event surface across all engines ([2dc3b16](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2dc3b16a5c963285d6ae6bcfb9a703a13ce38985))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))
* **oql,drivers:** bulk UPSERT on Mongo via bulkWrite ([4b89105](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4b8910500b1b87ad106ff66480b95a4121129357))
* **oql/mongo:** discriminated union for translator actions, drop dispatcher casts ([b04c578](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b04c57884da99bad9509487965792fe3960cd14b))
* **oql/translator:** graceful dialect fallbacks + RETURNING reduced to INSERT/UPSERT ([ebdab20](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ebdab200d93ffd5b6de16fce1c7e7e40d7453c42))
* **oql/translator:** MongoTranslator + live tests ([f0c4634](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f0c4634de7495db65e919ba14a2f8252c5f0fbfb))
* **oql/translator:** unified :name: placeholders + per-op RETURNING + live tests ([2e8ec6c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2e8ec6cbc61460fce9f1aed6174463bc609f5777))
* **utils:** add protected _emit for variance-tolerant emission ([5ed7c58](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5ed7c58b47c1bb3d74385b22fa1ebbb8d4a66ae4))


### Bug Fixes

* **drivers,compat-sweep:** three audit bugs; cross-runtime testability ([4a3ff55](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4a3ff551482b02c4cfc94a30c0ae85ea5be0fb29))
* **drivers/memcached:** add()/replace() return false on NOT_STORED ([0541e19](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0541e19a4c45647a04a30a3c1fe941679c636fc7))
* **drivers/memcached:** validate keys to prevent command injection ([2fedd37](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2fedd3709960439be033a8c927e5f22398c85a23))
* **drivers/mongo:** COUNT result.count is row count of data, not the COUNT value ([6633399](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6633399e28f25a3e04745569bd70cb90a640329f))
* **drivers/postgres:** bound tryReadMessage to live data window ([dd1cae7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/dd1cae7f1ee4276e1275386e56e8509cb09e1a5c))
* **drivers/test:** widen createEngine return type in shared SQL suite ([d8c29a9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d8c29a9fa249073db2ad17f6c168aa47eb5083f9))
* **drivers:** Add some tests, dogfood testing. ([e187e54](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e187e541fceeb2ad9304aed6ba72179317ec66a9))
* **drivers:** close idle-acquire race that blew past pool max ([059033a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/059033a7bb1418b5120449dd8b7d73707daf0bcc))
* **drivers:** drop unused import and redundant async (lint) ([402fa23](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/402fa23aea7ecbf4ac3843ce22be0f39cf963c7d))
* **drivers:** lossless SQLite INTEGER handling beyond 2^53 on every runtime ([0f6c483](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0f6c4835ea5c4b5e791a13e69e65907fed81601c))
* **drivers:** normalize SQLEngine COUNT result to { Count } ([cf17275](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/cf17275251adb4038919b0b2113562832d48dc1b))
* **drivers:** pin mongodb to 6.x — mongodb 7 crashes on Bun ([#28](https://github.com/TundraSoft/TundraLibs-1.0.0/issues/28)) ([dfc9cae](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/dfc9cae78f8a9fa2646aab4961333ce8375d0d5f))
* **drivers:** Postgres param oid + SQLite foreign_keys pragma ([98324c3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/98324c316daa10ab7cd50ba990fcd20fe3b59982))
* **drivers:** resolve high/medium review findings ([a5ed0e3](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a5ed0e3184f4b1bd20ada80e00d17069f29f9178))
* **drivers:** SQLite — Bun param mapping + Node graceful skip ([c3b89ab](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c3b89ab3d12afc906cfc458b5fa6d2730544911a))
* **drivers:** use compat file helpers in sqlite attach-leak test ([0c947b4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0c947b4ed17217f26c7395ef4df4675bc7295539))
* **global:** Formatting ([beb76e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/beb76e427ab0fa202f963705d58e329553aed456))
* **oql/sqlite:** emit DELETE FROM for TRUNCATE; detect INSERT/UPDATE/DELETE … RETURNING ([411919a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/411919a3955f84b15bb379480b1e1530e812f9c8))
* **oql:** aggregates / expressions can reference joined columns ([f28d575](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f28d575a44956ff94ac7192b7909d427bcffbad7))
* **oql:** substitute aggregate alias in HAVING clause body ([f6c22cb](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f6c22cb41177e2e8918e0dcb74d7611ae82282c9))
* **oql:** treat empty columnList as 'no constraint' in ColumnIdentifier ([2a01c46](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2a01c466bc378cd50bb005337bb14ee625b67561))


### Performance

* **drivers:** growable receive buffer in PG and Redis connections ([ffc23ea](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ffc23ea63f6910a4cfaefa8d2d4c23396aaca119))


### Refactoring

* **compat:** make TLSOptions mutually exclusive (inline vs file) ([9f43454](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/9f43454ad0f46841b9e192749d7dd89ec4eb432e))
* **drivers,compat,cacher:** unify TLS surface, add upgradeTls + Postgres/Redis/Memcached TLS ([34023a5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34023a5ec1b43d34aaa29876ffb9f6243724bac5))
* **drivers:** drain easy-win TODO items ([bba65ed](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/bba65edb051fdde8f69df1011c12bde99a7dc9d4))
* **drivers:** fold pool into BaseEngine, drop Pool class ([48c81ea](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/48c81ea53c588d5e4aa05c9f6042170637dbecc8))
* **drivers:** medium TODO sweep — type safety + ssl.enforce docs ([76947e2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/76947e2bfc7e0d1fed9db33e51cde62773d3d688))
* **drivers:** one type per file under types/ ([0efb2a7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0efb2a7cc76ebf3d1a95572e833e44ad15d5bfdf))
* **drivers:** privacy prefix sweep — private _x → __x ([eccf292](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/eccf292f602382ffc1309e3df7ecaa65e06b57dc))
* **drivers:** review fixes — dedup, error-mapping coverage, doc/slop cleanup ([c2fe56d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/c2fe56d6a12aed5b58f187cc335db408c5685567))
* **drivers:** split multi-class files, rename _tls→tls, route raw throws through DriverError/EngineError ([3acc502](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3acc502bf2b085036e56b3dc1493d04595c7d3f7))
* **drivers:** tighten exports, enrich SQLite error meta ([1ba7f2f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1ba7f2f770b2da2abd546594d588933e9408da6a))
* **oql/asserts:** rewrite Aggregates.ts in user style ([ee61e38](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ee61e38674a3657a76acfa46b661187b1d14b180))
* **oql/translator:** disable RETURNING on UPDATE for every dialect ([ba647ff](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ba647ffd8ea0937be0f18a72953c8fae04436dcd))
* **oql:** rename INSERT_QUERY to INSERT_FROM_QUERY, export validators, cleanup ([f2a29fd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f2a29fdaa24de0c9325713738f1949b1cb2876be))


### Documentation

* capture OQL-in-drivers decision for next session ([a25347e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a25347e15b76f562a6dade06896e3fa74a42afae))
* **drivers:** edge/serverless HTTP driver build plan ([953f841](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/953f841dc649a66e5e37d7a80e58b5ce35909c2b))
* **drivers:** mark drained TODO items as fixed ([d00a330](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d00a33005cd52ef9c18b87fc181073d82e435142))
* **drivers:** mark medium TODO items as fixed ([3cb1706](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3cb1706119bcda986ccf4770ef153a7e5be5db73))
* **drivers:** record Postgres/Maria prepared-statement cache as deferred ([012e1ec](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/012e1ecfa7b3ada008dfa12bfc40b5c2b6e16adf))
* **drivers:** rewrite Drivers.md and BaseEngine docs, add per-engine docs ([e58ed66](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e58ed6612bc6d0695a2102c9d0b87f326c7df1c9))
* **drivers:** sync engine docs with current API ([5081045](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/508104538de34137a4a7357e2a4fd68bb5ce2040))
* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* **non-wip:** strip \`[@since](https://github.com/since) 1.0.0\` from drivers/slogger/crypt/guardian/oql/cacher/id/hub ([4adf84d](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4adf84d2a633bc2f016edd7384a657cf472af706))


### Miscellaneous

* **dam:** remove deprecated DAM package ([8ce37e9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8ce37e93d7bd876cdd713b6fda53d23488c5272a))
