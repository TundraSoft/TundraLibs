# Changelog

## [1.6.0](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.5.0...oql-v1.6.0) (2026-11-16)


### Features

* **oql:** $exists and $nexists filters run on MongoDB ([#930](https://github.com/TundraSoft/TundraLibs/issues/930)) ([9a050d1](https://github.com/TundraSoft/TundraLibs/commit/9a050d1e70c56380c8c7376b9e26723bd2315328))
* **oql:** COALESCE, NULLIF and CASE expressions ([#854](https://github.com/TundraSoft/TundraLibs/issues/854)) ([1788040](https://github.com/TundraSoft/TundraLibs/commit/17880408750b2b8f54fa670a5d9ad10a6a46db58))
* **oql:** DATE_TRUNC expression for day, month and year ([#859](https://github.com/TundraSoft/TundraLibs/issues/859)) ([d35b91c](https://github.com/TundraSoft/TundraLibs/commit/d35b91c4bf6dd3ea1a31abc6db2cfe6892096c4f))
* **oql:** NULL-safe join and EXISTS keys via nullSafe ([#855](https://github.com/TundraSoft/TundraLibs/issues/855)) ([3a10e77](https://github.com/TundraSoft/TundraLibs/commit/3a10e7719d4a5aa93cf44b48bec994fe25b19016))
* **oql:** order by a joined column that is not projected ([#941](https://github.com/TundraSoft/TundraLibs/issues/941)) ([048f812](https://github.com/TundraSoft/TundraLibs/commit/048f812a752145dcec49516f18ab64bd8fa5769e))
* **oql:** orderBy may name a declared column that is not projected ([#853](https://github.com/TundraSoft/TundraLibs/issues/853)) ([87bcb43](https://github.com/TundraSoft/TundraLibs/commit/87bcb43c8e82fa77a19bfa71434ba55facb4db0a))


### Bug Fixes

* **drivers:** connect to a Postgres or Neon database whatever its time zone ([3a5c4f9](https://github.com/TundraSoft/TundraLibs/commit/3a5c4f9411992b88620a186420590e73e3ff7897))
* **drivers:** give a refused MariaDB or Postgres login its own error code ([3a5c4f9](https://github.com/TundraSoft/TundraLibs/commit/3a5c4f9411992b88620a186420590e73e3ff7897))
* **oql:** a $exists inside a CASE condition correlates to the query's table on SQL ([1a127e6](https://github.com/TundraSoft/TundraLibs/commit/1a127e6a0f28cd3efc601c6feadaa8f9625b2cb7))
* **oql:** a filter value naming an alias compares the alias's value ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** a MongoDB join returns one row per joined row ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** a MongoDB LIKE pattern matches across a newline, and not before one ([1a127e6](https://github.com/TundraSoft/TundraLibs/commit/1a127e6a0f28cd3efc601c6feadaa8f9625b2cb7))
* **oql:** a nested $exists correlates to its parent subquery on SQL ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** a Postgres LIKE pattern ending in a backslash matches it as MariaDB does ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** accept NOW as the date of a DATE_ADD ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** close two MongoDB NULL matches the SQL dialects never make ([#886](https://github.com/TundraSoft/TundraLibs/issues/886)) ([c9715d2](https://github.com/TundraSoft/TundraLibs/commit/c9715d2843786c066432b53359373fd918a9f7d4))
* **oql:** compare a computed filter operand on MongoDB ([#857](https://github.com/TundraSoft/TundraLibs/issues/857)) ([4ab8425](https://github.com/TundraSoft/TundraLibs/commit/4ab8425a87a74ed648f3cd6b851b96431d42c9a6))
* **oql:** count calendar months and years in DATE_DIFF on every dialect ([#869](https://github.com/TundraSoft/TundraLibs/issues/869)) ([a3e44d5](https://github.com/TundraSoft/TundraLibs/commit/a3e44d592ba4e15c2eb0359f557a7b85a8d5d22c))
* **oql:** count exact DATE_DIFF gaps correctly on SQLite ([#865](https://github.com/TundraSoft/TundraLibs/issues/865)) ([e91bb95](https://github.com/TundraSoft/TundraLibs/commit/e91bb95868ecea16973a5db922dd8b0ac9cc5d7d))
* **oql:** DATE_ADD and DATE_DIFF on MariaDB, negative DATE_ADD on SQLite ([#856](https://github.com/TundraSoft/TundraLibs/issues/856)) ([298fe78](https://github.com/TundraSoft/TundraLibs/commit/298fe78c5752a158750c9051a59d97e22d05eb03))
* **oql:** DATE_DIFF between two date columns on Postgres ([#885](https://github.com/TundraSoft/TundraLibs/issues/885)) ([3df7ea1](https://github.com/TundraSoft/TundraLibs/commit/3df7ea1338170202085634229f33ddef5ea2ee3f))
* **oql:** DIVIDE and MODULO keep the fraction and COUNT is a number on every SQL dialect ([#932](https://github.com/TundraSoft/TundraLibs/issues/932)) ([2f33380](https://github.com/TundraSoft/TundraLibs/commit/2f3338087d5f69d812fe862cb76a8f65f3c18387))
* **oql:** drop the partial unit in DATE_DIFF on MongoDB ([#867](https://github.com/TundraSoft/TundraLibs/issues/867)) ([11bdbac](https://github.com/TundraSoft/TundraLibs/commit/11bdbacf10d2426164669de9a9d7739a1a65ee65))
* **oql:** drop the partial unit in DATE_DIFF on Postgres ([#863](https://github.com/TundraSoft/TundraLibs/issues/863)) ([05141c2](https://github.com/TundraSoft/TundraLibs/commit/05141c20474334dd9717d056fb64d6a3fbaf82b7))
* **oql:** escape computed LIKE operands and align DATE_ADD and CURRENT_TIME results ([#942](https://github.com/TundraSoft/TundraLibs/issues/942)) ([641239c](https://github.com/TundraSoft/TundraLibs/commit/641239c725b9e62bea58b190f070574bf8fb0b77))
* **oql:** index conditions read expression columns and refuse clock expressions ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** keep a string starting with $ a literal in MongoDB expressions ([#884](https://github.com/TundraSoft/TundraLibs/issues/884)) ([c98192b](https://github.com/TundraSoft/TundraLibs/commit/c98192b55d56fe180968bb25180d1fdece57e635))
* **oql:** make a MongoDB CASE condition false on a NULL input ([#880](https://github.com/TundraSoft/TundraLibs/issues/880)) ([8212724](https://github.com/TundraSoft/TundraLibs/commit/82127241119efe56fdb9af55bb04507dd467d9cd))
* **oql:** MongoDB $exists reads a joined column and works inside CASE ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** MongoDB aggregates over no values match SQL ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** MongoDB COUNT, STRING_AGG, ARRAY_AGG distinct, computed patterns and SUBTRACT match SQL ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** MongoDB joins return SQL's rows, and rows carry _id only when projected ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** MongoDB returns what the SQL engines return for eight query shapes ([#939](https://github.com/TundraSoft/TundraLibs/issues/939)) ([ae67fe7](https://github.com/TundraSoft/TundraLibs/commit/ae67fe7ce551b2d72676f60cb90a4b897ea67604))
* **oql:** MongoDB UPDATE and DELETE read expression aliases as SQL does ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** never match NULL in a MongoDB comparison ([#862](https://github.com/TundraSoft/TundraLibs/issues/862)) ([93b24a4](https://github.com/TundraSoft/TundraLibs/commit/93b24a4267745e1dc49a2c0c8c80833d401ffc4d))
* **oql:** read a null EXISTS key as IS NULL ([#861](https://github.com/TundraSoft/TundraLibs/issues/861)) ([e7b6735](https://github.com/TundraSoft/TundraLibs/commit/e7b6735718f8d0a01199c919ed1b00d6f3aa9544))
* **oql:** reject a null inside a shorthand list filter ([#920](https://github.com/TundraSoft/TundraLibs/issues/920)) ([b35d568](https://github.com/TundraSoft/TundraLibs/commit/b35d568cf848bb382a4e4826414ff435753d4216))
* **oql:** reject an unknown time unit in a filter operand on every engine ([#881](https://github.com/TundraSoft/TundraLibs/issues/881)) ([9b24f4a](https://github.com/TundraSoft/TundraLibs/commit/9b24f4aa2e2c3192d425c41b1a377d8257907df5))
* **oql:** reject an unknown UNIX_TIMESTAMP unit in every translator ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** return DATE_DIFF as a number on every dialect ([#899](https://github.com/TundraSoft/TundraLibs/issues/899)) ([34053b1](https://github.com/TundraSoft/TundraLibs/commit/34053b10c06429227be580e16aff568065d0b59f))
* **oql:** return each engine's own result again where unreleased code forced them to agree ([1a127e6](https://github.com/TundraSoft/TundraLibs/commit/1a127e6a0f28cd3efc601c6feadaa8f9625b2cb7))
* **oql:** SQLite CURRENT_DATE equals a stored day, and empty ARRAY_AGG is NULL ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** stop DATE_ADD at the month's last day on SQLite ([#873](https://github.com/TundraSoft/TundraLibs/issues/873)) ([c7e0cb6](https://github.com/TundraSoft/TundraLibs/commit/c7e0cb623f89d098eb076f73e9f8bae8a0ee492d))
* **oql:** the validator checks operand counts, filter-value expressions and missing units ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** typed errors for relation filters and misspelled joined columns, MongoDB DIVIDE folds ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** validator errors say more, and arithmetic takes COALESCE, NULLIF and CASE ([#934](https://github.com/TundraSoft/TundraLibs/issues/934)) ([103c537](https://github.com/TundraSoft/TundraLibs/commit/103c53738b0f6c1cb60b95165eda9691ad9afb78))


### Documentation

* **oql:** add upgrade notes for the results and errors that changed since 1.5.0 ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** list the two MongoDB null gaps on the roadmap ([#871](https://github.com/TundraSoft/TundraLibs/issues/871)) ([45a2eb1](https://github.com/TundraSoft/TundraLibs/commit/45a2eb1ee716fc414fae64b26d7e3a17e87daaf2))
* **oql:** scope JSDoc, numeric argument listing and date expression results per engine ([0b811b0](https://github.com/TundraSoft/TundraLibs/commit/0b811b0f267364bf5c3b8df1a6682a3cc1119f45))
* **oql:** state what DATE_ADD and DATE_TRUNC return on each engine ([#882](https://github.com/TundraSoft/TundraLibs/issues/882)) ([79ef602](https://github.com/TundraSoft/TundraLibs/commit/79ef602d94ed3262980cd72ac5d6ce00db5ad170))

## [1.5.0](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.4.0...oql-v1.5.0) (2026-10-19)


### Features

* **oql:** add the TO_STRING expression ([#801](https://github.com/TundraSoft/TundraLibs/issues/801)) ([41447d3](https://github.com/TundraSoft/TundraLibs/commit/41447d38e1baf6c40787f2d36693eaf429730565))

## [1.4.0](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.3.0...oql-v1.4.0) (2026-10-05)


### Features

* **oql:** type a same-typed column reference as a filter value ([#768](https://github.com/TundraSoft/TundraLibs/issues/768)) ([887ed28](https://github.com/TundraSoft/TundraLibs/commit/887ed2874dbe5be77266d3f85209fce40414cc08))

## [1.3.0](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.2.2...oql-v1.3.0) (2026-09-27)


### Features

* **oql:** explicit conflict values for UPSERT with updateSet ([#734](https://github.com/TundraSoft/TundraLibs/issues/734)) ([e34a193](https://github.com/TundraSoft/TundraLibs/commit/e34a19395ddf70045e641b50a40ef6148a39ac13))


### Bug Fixes

* **oql:** evaluate expressions on MongoDB instead of storing them literally ([#738](https://github.com/TundraSoft/TundraLibs/issues/738)) ([6f0ad02](https://github.com/TundraSoft/TundraLibs/commit/6f0ad0257d4ff66e610725b41447199881996940))


### Documentation

* **oql:** note Mongo insert expressions in the capability rows ([#741](https://github.com/TundraSoft/TundraLibs/issues/741)) ([8a59e5b](https://github.com/TundraSoft/TundraLibs/commit/8a59e5b88ee01ce084874dfd8675ad8fff5300ef))

## [1.2.2](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.2.1...oql-v1.2.2) (2026-09-27)


### Bug Fixes

* **oql:** render SQLite timestamps as ISO 8601 UTC ([#728](https://github.com/TundraSoft/TundraLibs/issues/728)) ([4ac0f35](https://github.com/TundraSoft/TundraLibs/commit/4ac0f3555c4519053459ea6c7cd87861b9657d06))

## [1.2.1](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.2.0...oql-v1.2.1) (2026-09-26)


### Bug Fixes

* **global:** pass the Weekly Health deno-canary lane under TypeScript 7 ([#717](https://github.com/TundraSoft/TundraLibs/issues/717)) ([fee29d6](https://github.com/TundraSoft/TundraLibs/commit/fee29d6e7484b8d8010ecc81789fa939e0a29eb1))

## [1.2.0](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.1.4...oql-v1.2.0) (2026-09-20)


### Features

* **oql:** UNIX_TIMESTAMP expression — the current time as a 64-bit integer epoch ([#697](https://github.com/TundraSoft/TundraLibs/issues/697)) ([bf37250](https://github.com/TundraSoft/TundraLibs/commit/bf3725013118802987ab2ce84b83f1c39c270324))

## [1.1.4](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.1.3...oql-v1.1.4) (2026-09-18)


### Documentation

* point package READMEs at the wiki and fix the wiki sync dropping 68 pages ([#685](https://github.com/TundraSoft/TundraLibs/issues/685)) ([97810ec](https://github.com/TundraSoft/TundraLibs/commit/97810eced5073e3fc8da0f2b8be602f480966862))

## [1.1.3](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.1.2...oql-v1.1.3) (2026-09-13)


### Bug Fixes

* **oql,drivers,norm:** SQLite dbSchema is a physical name prefix, not ATTACH ([#675](https://github.com/TundraSoft/TundraLibs/issues/675)) ([45438af](https://github.com/TundraSoft/TundraLibs/commit/45438afb1aefced3a21c7425296027f9797d54dd))

## [1.1.2](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.1.1...oql-v1.1.2) (2026-08-25)


### Documentation

* add "familiar tool" glossary + oql/restler intro fixes ([#614](https://github.com/TundraSoft/TundraLibs/issues/614)) ([aa60427](https://github.com/TundraSoft/TundraLibs/commit/aa60427ee635c3a0487e3bbb98f3a7078d0f8b6d))
* JSR/CI badges + discoverability pass (READMEs, keywords) ([#612](https://github.com/TundraSoft/TundraLibs/issues/612)) ([734e111](https://github.com/TundraSoft/TundraLibs/commit/734e1111517c452288bd7b78413abdf3899b1e6d))
* **oql:** add a cross-dialect translation example ([#560](https://github.com/TundraSoft/TundraLibs/issues/560)) ([0b7aa75](https://github.com/TundraSoft/TundraLibs/commit/0b7aa75b851822b0f0f6145969fa6560ff3a3f4d))
* **oql:** deepen query-type, expression, and validation coverage; fix Mongo JOIN claims ([#552](https://github.com/TundraSoft/TundraLibs/issues/552)) ([b41822c](https://github.com/TundraSoft/TundraLibs/commit/b41822c5e27a1035ba30411c379491271b9782ee))

## [1.1.1](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.1.0...oql-v1.1.1) (2026-08-21)


### Refactoring

* **oql:** align with repo conventions ([f6c77f0](https://github.com/TundraSoft/TundraLibs/commit/f6c77f0d24c00b28825cb526da9bbd9f6bf0cec6))

## [1.1.0](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.0.5...oql-v1.1.0) (2026-08-19)


### Features

* **oql:** JSON-path filtering in where clauses via [@col](https://github.com/col).[@key](https://github.com/key) ([#445](https://github.com/TundraSoft/TundraLibs/issues/445)) ([1ecb3e0](https://github.com/TundraSoft/TundraLibs/commit/1ecb3e0776cfdde70665d12bcb8d2fab91865350))


### Documentation

* **oql:** correct SQLite schema-support and LPAD/RPAD-fill claims ([#432](https://github.com/TundraSoft/TundraLibs/issues/432)) ([8b94675](https://github.com/TundraSoft/TundraLibs/commit/8b946755ee986c3475592dd833140df0dfcfcd6c))
* **oql:** drop the redundant TODO.md, fold its unique note into ROADMAP ([#459](https://github.com/TundraSoft/TundraLibs/issues/459)) ([f2d4825](https://github.com/TundraSoft/TundraLibs/commit/f2d48255c044c88196f97a816139c77616be1e1d))
* **oql:** retract unbuilt full-text-search and window-function claims ([#455](https://github.com/TundraSoft/TundraLibs/issues/455)) ([74b8c10](https://github.com/TundraSoft/TundraLibs/commit/74b8c10f4dfb50c445826acd8c0ca1f86890b2e6))

## [1.0.5](https://github.com/TundraSoft/TundraLibs/compare/oql-v1.0.4...oql-v1.0.5) (2026-08-18)


### Documentation

* **oql:** fix description punctuation, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

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
