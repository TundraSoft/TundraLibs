# Changelog

## [1.0.4](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.0.3...oql-v1.0.4) (2026-08-17)


### Documentation

* **oql:** add module doc to ./errors entrypoint ([#314](https://github.com/TundraSoft/TundraLibs/issues/314)) ([bcb6dbd](https://github.com/TundraSoft/TundraLibs/commit/bcb6dbd52aaefe8d948c03348eff91f0f7c1d892))

## [1.0.3](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.0.2...oql-v1.0.3) (2026-08-15)


### Bug Fixes

* **compat:** path fallback, barrel test leak, and the udpSocket hang on Workers ([#283](https://github.com/TundraSoft/TundraLibs/issues/283)) ([317fc0f](https://github.com/TundraSoft/TundraLibs/commit/317fc0fdbaae712ed913a40f70852188508f0e0f))

## [1.0.2](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.0.1...oql-v1.0.2) (2026-08-14)


### Bug Fixes

* **oql:** emit correct SQLite LPAD/RPAD and stop stranding the fill parameter ([21e535c](https://github.com/TundraSoft/TundraLibs/commit/21e535c2a91002c1a5b0f8e9a142566cfc3ab14e))

## [1.0.1](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.0.0...oql-v1.0.1) (2026-08-13)


### Documentation

* **oql:** document Workers and browser runtime support ([#232](https://github.com/TundraSoft/TundraLibs/issues/232)) ([a5fb294](https://github.com/TundraSoft/TundraLibs/commit/a5fb29400ea9ca492511c052533378395c9499d4))

## [1.0.0](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.0.0-dev6.7...oql-v1.0.0) (2026-08-01)


### Features

* TundraLibs 1.0.0 monorepo baseline (supersedes 0.8.x flat libraries) ([3512d64](https://github.com/TundraSoft/TundraLibs/commit/3512d646020b62dbae5442c921bfb086161d0402))

## [1.0.0-dev6.7](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/oql-v1.0.0-dev6.6...oql-v1.0.0-dev6.7) (2026-07-28)


### Documentation

* **oql:** fix broken join + HASH-args examples (structural) ([74f746c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/74f746c0183cc9619c3d4bca7f52370eef8bb99e))

## [1.0.0-dev6.6](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/oql-v1.0.0-dev6.5...oql-v1.0.0-dev6.6) (2026-07-28)


### Documentation

* **oql:** fix broken join + HASH-args examples (structural) ([74f746c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/74f746c0183cc9619c3d4bca7f52370eef8bb99e))
* **oql:** fix broken query examples (referenced columns not in column list) ([3e7e1f4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3e7e1f4129cbacf255577d0faf931d965b9fa026))

## [1.0.0-dev6.6](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/oql-v1.0.0-dev6.5...oql-v1.0.0-dev6.6) (2026-07-28)


### Documentation

* **oql:** fix broken query examples (referenced columns not in column list) ([3e7e1f4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3e7e1f4129cbacf255577d0faf931d965b9fa026))

## [1.0.0-dev6.5](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/oql-v1.0.0-dev6.4...oql-v1.0.0-dev6.5) (2026-07-25)


### Bug Fixes

* **oql:** resolve round-3 review findings ([7d8cb7b](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7d8cb7b4d360d2dfb2f6b08ec64cadb2fa18995e))
* **oql:** resolve round-4 review findings ([49ddec9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/49ddec9d0246bfe7564d00523e1326dbc282fc65))

## [1.0.0-dev6.4](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/oql-v1.0.0-dev6.3...oql-v1.0.0-dev6.4) (2026-07-23)


### Bug Fixes

* **oql:** close re-review findings — Mongo COUNT(col) & Maria comment escaping ([7850c89](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/7850c89f1258d01ec5970acb960c2b7d16e28bb5))
* **oql:** close review findings — offset-only SQL, Mongo joins/dates/LIKE, param keying ([3f1a155](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3f1a155e2b8369bf7b21555eddc6f593b6e8b872))

## [1.0.0-dev6.3](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/oql-v1.0.0-dev6.2...oql-v1.0.0-dev6.3) (2026-07-14)


### Bug Fixes

* **norm:** DDL emission ordering — namespaces, FK cycle-break, non-PK-unique defer ([836340e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/836340e8b60d701d77a4b01990c9f3f9d82b288f))
* **norm:** DDL emission ordering + oql BaseError conformance (MarketMaker report) ([d299f53](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/d299f53d28307a09f0f7297256547ed888507f27))


### Refactoring

* **oql:** OqlError extends BaseError from utils (CONVENTIONS.md) ([6310db6](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6310db6834c836c1d3d298436adcaddee7efce39))

## [1.0.0-dev6.2](https://github.com/TundraSoft/TundraLibs-1.0.0/compare/oql-v1.0.0-dev6.1...oql-v1.0.0-dev6.2) (2026-07-14)


### Features

* **compat,hub:** hub package extraction; primitive WebSocketServer; runtime fixes ([24cb4b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/24cb4b21a3cc1afdafeb1398f4eb0e3aec2fc583))
* **drivers/sqlite:** file-per-schema directory mode + OQL schema support ([8858db4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/8858db4ef2b55933639ea618dc30c48746b822c2))
* NORM rewrite, drivers overhaul, and independent CI/release pipeline ([f8a0271](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f8a0271f5d023517af6b64873db6bec38b8dd466))
* **norm,oql:** filter auto-join, project option, defaults-fire-on-null, upsert disableUpdate strip ([2f84291](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2f84291978fb7f7bcd6b2dfae64acf9940fb7733))
* **oql,drivers:** bulk UPSERT on Mongo via bulkWrite ([4b89105](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4b8910500b1b87ad106ff66480b95a4121129357))
* **oql,norm:** RETURNING projection on INSERT/UPSERT — narrow what comes back ([6af1e4c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6af1e4cee58951fbcf4d4683ce72560c9ab143e1))
* **oql/mongo:** discriminated union for translator actions, drop dispatcher casts ([b04c578](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b04c57884da99bad9509487965792fe3960cd14b))
* **oql/translator:** AbstractTranslator + SQLiteTranslator ([16702e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/16702e58a020cbdfd70689c1b1b3cf8c20cd57a0))
* **oql/translator:** graceful dialect fallbacks + RETURNING reduced to INSERT/UPSERT ([ebdab20](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ebdab200d93ffd5b6de16fce1c7e7e40d7453c42))
* **oql/translator:** MongoTranslator + live tests ([f0c4634](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f0c4634de7495db65e919ba14a2f8252c5f0fbfb))
* **oql/translator:** per-method API, 3 dialects, golden-file verification ([f503507](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f50350742c0dadd9305be7aba4918809d2ded392))
* **oql/translator:** unified :name: placeholders + per-op RETURNING + live tests ([2e8ec6c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2e8ec6cbc61460fce9f1aed6174463bc609f5777))
* **oql:** $exists filters, DISTINCT, materialized views, ALTER TABLE DDL ([6ecc60f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6ecc60f06f23ba897648877d4ab1e5edf214ddea))
* **oql:** add TIMESTAMPTZ SQL data type ([a5ea9db](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/a5ea9dbd33473d610f65ffdea9ccb850432b25a1))
* **oql:** assertInsertFromQuery / isInsertFromQuery for INSERT_QUERY ([6757fe8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6757fe88add7584c351f79e7a7da5b1ffab52100))
* **oql:** inline literals in CREATE_VIEW / ALTER_VIEW translation ([af3cf84](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/af3cf84626fc91615ccc034f2755fc1633049e8e))


### Bug Fixes

* **global:** Formatting ([beb76e4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/beb76e427ab0fa202f963705d58e329553aed456))
* **oql/maria:** emit RETURNING on UPSERT (ON DUPLICATE KEY UPDATE supports it on 10.5+) ([1c350f9](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1c350f93bb9646f771055c4ab4495b337afb5c2f))
* **oql/mongo:** honour updateOnConflict in upsert; place \$match after \$lookup when filter touches joined fields ([ca7d83c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ca7d83c3c247c8ebf5613437bbf8cbb3d72a1e5b))
* **oql/sqlite:** emit DELETE FROM for TRUNCATE; detect INSERT/UPDATE/DELETE … RETURNING ([411919a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/411919a3955f84b15bb379480b1e1530e812f9c8))
* **oql/translator:** JSON_ROW emits an array aggregate, not a row builder ([0c1228a](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0c1228ae981a573d2936fae1d7987411b9f665a8))
* **oql:** aggregates / expressions can reference joined columns ([f28d575](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f28d575a44956ff94ac7192b7909d427bcffbad7))
* **oql:** empty columnList means 'reject all refs', not 'no constraint' ([77d7145](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/77d7145b27e9b92ca2114b2acd1b5e609bfa4054))
* **oql:** escape backslashes in MariaDB literals and quotes in SQLite ATTACH path ([03442db](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/03442dbaf02dbbdea475e28682407e77c058c4bd))
* **oql:** prefix unused depth/maxDepth assert params with underscore ([906bd41](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/906bd418e0c202d9f04d6b4524154830cf4ea189))
* **oql:** require `table` on DROP_INDEX for dialect uniformity ([f74add7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f74add7463e3d74705ae852acae8a707c01e2768))
* **oql:** resolve @-column-ref filter values to $expr in Mongo ([19ccf4f](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/19ccf4f8881c815a274eeff5fd1024bf6317e130))
* **oql:** resolve high/medium review findings ([52105a2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/52105a2501b52835dd5c58367d2da49a955dba7e))
* **oql:** substitute aggregate alias in HAVING clause body ([f6c22cb](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f6c22cb41177e2e8918e0dcb74d7611ae82282c9))
* **oql:** treat empty columnList as 'no constraint' in ColumnIdentifier ([2a01c46](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2a01c466bc378cd50bb005337bb14ee625b67561))
* **oql:** unify @-value resolution across all filter value positions ([0f8324c](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/0f8324c6c590a6ee40e3d97098187c50570460c3))
* set the versions ([ebc3855](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ebc385530b1b36a76fe003320fb9c54460ba0df4))


### Refactoring

* **oql/asserts:** @-string falls through to literal when not a known column ([5053df8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/5053df8444d4d8e394f37f7bf27673553bd9414f))
* **oql/asserts:** clean up Common.ts files (Query, DDL, DML) ([4b56067](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/4b560675b11eb1a7a463b996eda90f3969768b15))
* **oql/asserts:** clean up DDL validators + add missing tests ([6333393](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/63333933770004f330df4f0cf80b8ceb5a552a2f))
* **oql/asserts:** clean up DML validators (Count/Delete/Insert/Update/Upsert/InsertFromQuery/Select) ([57122b2](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/57122b2d5899f5db00ae02ac0a48c1e8cd840492))
* **oql/asserts:** dedupe Expression arg validators; type-set dispatcher ([6049d18](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6049d189f4f04cbbdbd9c53e82b04bc0dc9edfaf))
* **oql/asserts:** drop gratuitous underscore aliasing in Joins.ts ([322d6ff](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/322d6ffe54209cebd61ca5fc0e2000310662a1dd))
* **oql/asserts:** rewrite Aggregates.ts in user style ([ee61e38](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ee61e38674a3657a76acfa46b661187b1d14b180))
* **oql/asserts:** tighten Query.ts JSDoc; strip ✓/✗ markers across Expressions, Filters, ColumnIdentifier ([b65b4f4](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/b65b4f4085b9f9f8851ffd4e7724f07dbf6f74f6))
* **oql/translator:** disable RETURNING on UPDATE for every dialect ([ba647ff](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/ba647ffd8ea0937be0f18a72953c8fae04436dcd))
* **oql:** camelCase assert helper files, lowercase asserts folders ([6b696c8](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/6b696c8eb0819287fa3d4052e9fbede01c338c6b))
* **oql:** cleanup AI scratch files; add INSERT_QUERY query type ([1fc724b](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/1fc724bff17d83b6f6ea4e354bb3ab96eb4a4c71))
* **oql:** rename INSERT_QUERY to INSERT_FROM_QUERY, export validators, cleanup ([f2a29fd](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/f2a29fdaa24de0c9325713738f1949b1cb2876be))
* **oql:** review fixes — stable error codes, crypto/SUBSTR bug fixes, dedup ([705fa91](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/705fa91b135c38e557d6ed7174105f3b16de77e2))
* **oql:** split types into sub-folders + add errors module ([e449463](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/e449463a1910c0d63b7967665a4b41a27a3ce80a))
* **oql:** use QueryTypes alias in assertQuery; wire INSERT_QUERY ([2a6a9e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/2a6a9e5fc5f4829b80049be9c7f229d672d0ca37))


### Documentation

* **global:** drop version numbers from runtime badges in package docs ([29401e5](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/29401e59d2786b16ee1ee84e734b42c27d301835))
* **global:** rename package main docs to README.md, rebuild wiki sync ([34d0316](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/34d0316e8ccd6f9a370b1889d14be3fce35ba7b2))
* **oql:** refresh module docs, restructure TYPE-REVIEW into per-area guides ([08d9035](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/08d90358d21093ea9eba22df4f4f3f5156c34fbe))
* **oql:** sync translator/types/asserts docs with current API ([cb1f5e0](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/cb1f5e0d819cb1309f4b119e8217ff2402da8b4d))
* **oql:** TODO — explicit "Won't do" entry for live tests in OQL ([3744fb7](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/3744fb7cb0b26e6abd9140b2dae13ed64a257133))
* **oql:** update RETURNING matrix for Mongo re-fetch parity ([978059e](https://github.com/TundraSoft/TundraLibs-1.0.0/commit/978059ef8fb489df47d63e2912593504e95d7b43))
