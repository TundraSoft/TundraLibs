# Changelog

## [0.6.0](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.5.6...tracer-v0.6.0) (2026-08-19)


### ⚠ BREAKING CHANGES

* **doctor:** rebuild injection on TC39 decorators and inject initializers
* **tracer:** move the OTLP exporter under exporters/

### Features

* add @tundralibs/tracer — distributed tracing kernel ([561ee8b](https://github.com/TundraSoft/TundraLibs/commit/561ee8b8c2f99cafd2a71b673153103b3cad020f))
* add @tundralibs/tracer distributed tracing kernel ([7b0125f](https://github.com/TundraSoft/TundraLibs/commit/7b0125f0d467c62b46c7da57a03267dbf806af0b))
* **doctor:** rebuild injection on TC39 decorators and inject initializers ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **tracer:** add OTLP exporter, batch processor and semantic conventions ([8b5c0da](https://github.com/TundraSoft/TundraLibs/commit/8b5c0da08b956fe354fa2db975ddfbd4e5164e8f))
* **tracer:** add OTLP exporter, batch processor and semantic conventions ([cf8bab6](https://github.com/TundraSoft/TundraLibs/commit/cf8bab627b6b1b4d04c61b35df79a7b5a42f8bc1))
* **tracer:** ship the composition-root adapters — wrap and logContext ([35214b9](https://github.com/TundraSoft/TundraLibs/commit/35214b91cc1f30a56813ce7b2c4701ed39a48147))
* **tracer:** ship the composition-root adapters — wrap and logContext ([bc212e9](https://github.com/TundraSoft/TundraLibs/commit/bc212e9df56893008593d6b57c8cfc3f61946d00))
* **tracer:** wrapClient + propagation — the outbound adapters ([2797c16](https://github.com/TundraSoft/TundraLibs/commit/2797c16b97bdca8ca4dc6d93f42e5a1490b41a71))
* **tracer:** wrapClient + propagation outbound adapters ([0ff696c](https://github.com/TundraSoft/TundraLibs/commit/0ff696c11ce4ec7e87f9e47d048fd7835ace8904))


### Bug Fixes

* **doctor:** resolve utils via narrow subpaths and document bundler targets ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **tracer:** build the active-span context on first use, not at import ([#225](https://github.com/TundraSoft/TundraLibs/issues/225)) ([02b756c](https://github.com/TundraSoft/TundraLibs/commit/02b756c38af79a15eeec124dd007ce99b44b8efa))
* **utils:** add a Singleton subpath export, mirroring BaseError ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **utils:** harden Events and Options; adopt across the suite ([b32ffc4](https://github.com/TundraSoft/TundraLibs/commit/b32ffc4e9f9a4971070fd1a928141678d7cd4fce))
* **utils:** harden Events and Options; adopt across the suite ([23d744c](https://github.com/TundraSoft/TundraLibs/commit/23d744c2025efd9735eec85627bcac04eb01ef3d))
* **utils:** migrate Once, Memoize and Throttle to TC39 standard decorators ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))


### Refactoring

* **tracer:** move the OTLP exporter under exporters/ ([bf71253](https://github.com/TundraSoft/TundraLibs/commit/bf712533219e78fadc7bfefff3f3c30025c400d1))


### Documentation

* **ambient:** add a Cloudflare Workers badge and a browser incompatibility note ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **cacher:** sharpen the Browser/Worker compatibility section, sync the package.json description, add a missing license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **compat:** add a per-module Browser/Workers compatibility table, fix a missing package.json description and license ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **cronus:** document why there is no Browser/Workers badge, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **crypt:** add Browser and Cloudflare Workers badges, sync the package.json description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **doctor:** add Browser and Cloudflare Workers badges, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **drivers:** mention the edge/serverless HTTP dialects in the package description, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **guardian:** sync the package.json description, add a missing license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **id:** add Browser and Cloudflare Workers badges, add NanoID to the description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **metro-man:** add Browser and Cloudflare Workers badges, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **norm:** correct the Browser/Worker compatibility section, fix a stale unpublished package.json description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* note the extra install on cross-package examples ([#298](https://github.com/TundraSoft/TundraLibs/issues/298)) ([44e1eff](https://github.com/TundraSoft/TundraLibs/commit/44e1effee2ae174946e2cdb0356fbc12d8c9ed4a))
* **oql:** fix description punctuation, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **pact:** add Browser and Cloudflare Workers badges, sync the package.json description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **radrouter:** add Browser and Cloudflare Workers badges, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **restler:** add Browser and Cloudflare Workers badges, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **rpc:** document why there is no Browser/Workers badge, add a missing package.json license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **slogger:** sharpen the Browser/Worker compatibility section, merge description wording, add a missing license field ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **tracer:** add Browser and Cloudflare Workers badges with a startActiveSpan caveat ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))
* **tracer:** add the event-based drivers recipe ([d911245](https://github.com/TundraSoft/TundraLibs/commit/d9112454b65765362c46980dd185c02719c48a0c))
* **tracer:** add the how-it-works guides, and a real-collector conformance test ([8b14e60](https://github.com/TundraSoft/TundraLibs/commit/8b14e609a4abf5a931a97cddc1b41e08351412b6))
* **tracer:** align the log-correlation example keys with otelLogFormatter ([564077d](https://github.com/TundraSoft/TundraLibs/commit/564077dd237fb444f28edc7e58be32d14104d9fc))
* **tracer:** align the log-correlation example keys with otelLogFormatter ([8574578](https://github.com/TundraSoft/TundraLibs/commit/85745787e533d9051dbef70d3fe012ffc6112d0e))
* **tracer:** describe OTLPExporter constructor ([#316](https://github.com/TundraSoft/TundraLibs/issues/316)) ([65089fc](https://github.com/TundraSoft/TundraLibs/commit/65089fcaaee73858836caf4136ba114001b6dec8))
* **tracer:** fix trace_id key name in sampling guide ([1b94144](https://github.com/TundraSoft/TundraLibs/commit/1b9414418659e707701d4613bceeb8277057a4b7))
* **tracer:** fix trace_id key name in sampling guide ([e6fe956](https://github.com/TundraSoft/TundraLibs/commit/e6fe956b111757039a14df0ab44532e6cc1a3329))
* **tracer:** make the recipes wiki-visible ([941195f](https://github.com/TundraSoft/TundraLibs/commit/941195ffb47d56a7c392b957cc1f825c039873a1))
* **tracer:** norm recipes — event spans (Layer 1) and witness nesting (Layer 2) ([a1686d6](https://github.com/TundraSoft/TundraLibs/commit/a1686d64896579b4c6b0ba7734197795edf8cab0))
* **tracer:** norm recipes — event spans and witness nesting ([24165dc](https://github.com/TundraSoft/TundraLibs/commit/24165dca3112c1b4b9d8c2d06e027537998ee3f2))
* **tracer:** promote the browser/Workers caveat into its own section ([f3cb35e](https://github.com/TundraSoft/TundraLibs/commit/f3cb35ed041cd7080ec275f18779f8b585eeb4d6))
* **tracer:** revise the outbound-tracing decision record ([fc1049e](https://github.com/TundraSoft/TundraLibs/commit/fc1049e394c2aeff9af46a17e33e824ed80f44de))
* **tracer:** verify documentation examples and document the public API ([#243](https://github.com/TundraSoft/TundraLibs/issues/243)) ([ea14ac9](https://github.com/TundraSoft/TundraLibs/commit/ea14ac9da6974dbf236587dcc381f0dc21e2137f))
* **utils:** add Browser and Cloudflare Workers badges, mention Singleton in the description ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

## [0.5.6](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.5.5...tracer-v0.5.6) (2026-08-18)


### Documentation

* **tracer:** add Browser and Cloudflare Workers badges with a startActiveSpan caveat ([e585073](https://github.com/TundraSoft/TundraLibs/commit/e58507320570db77ed3e9d1cb5d5c45ef93f4600))

## [0.5.5](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.5.4...tracer-v0.5.5) (2026-08-17)


### Documentation

* **tracer:** describe OTLPExporter constructor ([#316](https://github.com/TundraSoft/TundraLibs/issues/316)) ([65089fc](https://github.com/TundraSoft/TundraLibs/commit/65089fcaaee73858836caf4136ba114001b6dec8))

## [0.5.4](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.5.3...tracer-v0.5.4) (2026-08-15)


### Documentation

* note the extra install on cross-package examples ([#298](https://github.com/TundraSoft/TundraLibs/issues/298)) ([44e1eff](https://github.com/TundraSoft/TundraLibs/commit/44e1effee2ae174946e2cdb0356fbc12d8c9ed4a))

## [0.5.3](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.5.2...tracer-v0.5.3) (2026-08-14)


### Documentation

* **tracer:** verify documentation examples and document the public API ([#243](https://github.com/TundraSoft/TundraLibs/issues/243)) ([ea14ac9](https://github.com/TundraSoft/TundraLibs/commit/ea14ac9da6974dbf236587dcc381f0dc21e2137f))

## [0.5.2](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.5.1...tracer-v0.5.2) (2026-08-13)


### Bug Fixes

* **tracer:** build the active-span context on first use, not at import ([#225](https://github.com/TundraSoft/TundraLibs/issues/225)) ([02b756c](https://github.com/TundraSoft/TundraLibs/commit/02b756c38af79a15eeec124dd007ce99b44b8efa))

## [0.5.1](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.5.0...tracer-v0.5.1) (2026-08-12)


### Bug Fixes

* **utils:** harden Events and Options; adopt across the suite ([b32ffc4](https://github.com/TundraSoft/TundraLibs/commit/b32ffc4e9f9a4971070fd1a928141678d7cd4fce))

## [0.5.0](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.4.1...tracer-v0.5.0) (2026-08-09)


### Features

* **tracer:** wrapClient + propagation — the outbound adapters ([2797c16](https://github.com/TundraSoft/TundraLibs/commit/2797c16b97bdca8ca4dc6d93f42e5a1490b41a71))
* **tracer:** wrapClient + propagation outbound adapters ([0ff696c](https://github.com/TundraSoft/TundraLibs/commit/0ff696c11ce4ec7e87f9e47d048fd7835ace8904))


### Documentation

* **tracer:** revise the outbound-tracing decision record ([fc1049e](https://github.com/TundraSoft/TundraLibs/commit/fc1049e394c2aeff9af46a17e33e824ed80f44de))

## [0.4.1](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.4.0...tracer-v0.4.1) (2026-08-09)


### Documentation

* **tracer:** fix trace_id key name in sampling guide ([1b94144](https://github.com/TundraSoft/TundraLibs/commit/1b9414418659e707701d4613bceeb8277057a4b7))

## [0.4.0](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.3.1...tracer-v0.4.0) (2026-08-09)


### Features

* **tracer:** ship the composition-root adapters — wrap and logContext ([35214b9](https://github.com/TundraSoft/TundraLibs/commit/35214b91cc1f30a56813ce7b2c4701ed39a48147))

## [0.3.1](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.3.0...tracer-v0.3.1) (2026-08-09)


### Documentation

* **tracer:** norm recipes — event spans (Layer 1) and witness nesting (Layer 2) ([a1686d6](https://github.com/TundraSoft/TundraLibs/commit/a1686d64896579b4c6b0ba7734197795edf8cab0))
* **tracer:** norm recipes — event spans and witness nesting ([24165dc](https://github.com/TundraSoft/TundraLibs/commit/24165dca3112c1b4b9d8c2d06e027537998ee3f2))

## [0.3.0](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.2.0...tracer-v0.3.0) (2026-08-09)


### ⚠ BREAKING CHANGES

* **tracer:** move the OTLP exporter under exporters/

### Features

* **tracer:** add OTLP exporter, batch processor and semantic conventions ([8b5c0da](https://github.com/TundraSoft/TundraLibs/commit/8b5c0da08b956fe354fa2db975ddfbd4e5164e8f))


### Refactoring

* **tracer:** move the OTLP exporter under exporters/ ([bf71253](https://github.com/TundraSoft/TundraLibs/commit/bf712533219e78fadc7bfefff3f3c30025c400d1))


### Documentation

* **tracer:** add the event-based drivers recipe ([d911245](https://github.com/TundraSoft/TundraLibs/commit/d9112454b65765362c46980dd185c02719c48a0c))
* **tracer:** add the how-it-works guides, and a real-collector conformance test ([8b14e60](https://github.com/TundraSoft/TundraLibs/commit/8b14e609a4abf5a931a97cddc1b41e08351412b6))
* **tracer:** align the log-correlation example keys with otelLogFormatter ([564077d](https://github.com/TundraSoft/TundraLibs/commit/564077dd237fb444f28edc7e58be32d14104d9fc))
* **tracer:** make the recipes wiki-visible ([941195f](https://github.com/TundraSoft/TundraLibs/commit/941195ffb47d56a7c392b957cc1f825c039873a1))

## [0.2.0](https://github.com/TundraSoft/TundraLibs/compare/tracer-v0.1.0...tracer-v0.2.0) (2026-08-09)


### Features

* add @tundralibs/tracer — distributed tracing kernel ([561ee8b](https://github.com/TundraSoft/TundraLibs/commit/561ee8b8c2f99cafd2a71b673153103b3cad020f))
* add @tundralibs/tracer distributed tracing kernel ([7b0125f](https://github.com/TundraSoft/TundraLibs/commit/7b0125f0d467c62b46c7da57a03267dbf806af0b))
