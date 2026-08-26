/**
 * @fileoverview `pact(options)` — one-time app-wide init for the pact
 * auth adapter. Builds the `Pact` instance, resolves the configured
 * credential schemes, and registers both under the {@link PACT} doctor
 * label — the ONLY place either happens. `authenticate()`/`authorize()`
 * resolve this via `inject(PACT)`, so calling `pact()` more than once is
 * a config error rather than silently supported: `Doctor.stock` already
 * refuses a second registration under the same label.
 *
 * There is deliberately no `usePact()` helper distinct from `Doctor.stock`
 * and no property on the app object — a second registration path invites
 * the same service-locator drift a blessed `app.provide/get` would (see
 * DESIGN-Auth.md's "Considered & rejected").
 *
 * @module
 */

import { Doctor, type Label, label } from '@tundralibs/doctor';
import {
  Pact,
  type PactEvents,
  type PactOptions,
  type PactPermissionBits,
} from '@tundralibs/pact';
import type { EventOptionKeys } from '@tundralibs/utils';
import { RapidError } from '../../errors/mod.ts';
import {
  apiKeyExtractor,
  basicExtractor,
  bearerExtractor,
  hmacExtractor,
  type PactApiKeySchemeOptions,
  type PactBasicSchemeOptions,
  type PactBearerSchemeOptions,
  type PactHmacSchemeOptions,
  type PactResolvedScheme,
  type PactScheme,
  type PactTokenSchemeOptions,
  tokenExtractor,
} from './credentials.ts';

/**
 * The doctor label `authenticate()`/`authorize()` resolve via
 * `inject(PACT)`. Stocked by {@link pact} as a side effect — never stock
 * it yourself.
 */
export const PACT: Label<{
  pact: Pact;
  schemes: Partial<Record<PactScheme, PactResolvedScheme>>;
}> = label('Pact');

/**
 * Options for {@link pact}: `Pact.create()`'s own options, plus which
 * credential schemes this app accepts and how each extracts / responds.
 * Every scheme key is optional — configure only the ones you use.
 */
export type PactMiddlewareOptions<
  P extends PactPermissionBits = PactPermissionBits,
> = EventOptionKeys<PactOptions<P>, PactEvents> & {
  bearer?: PactBearerSchemeOptions;
  basic?: PactBasicSchemeOptions;
  token?: PactTokenSchemeOptions;
  apiKey?: PactApiKeySchemeOptions;
  hmac?: PactHmacSchemeOptions;
};

/**
 * Build the app's `Pact` instance and register it for `authenticate()`/
 * `authorize()` to resolve. Call exactly ONCE, typically at boot; every
 * other file imports `authenticate`/`authorize` directly rather than
 * this function's return value, so there is nothing to re-import and
 * nothing to accidentally re-initialize by calling `pact()` a second
 * time in the wrong file. The returned instance is for advanced direct
 * use (e.g. `pact.sign()` outside a request) — ordinary route code never
 * needs it.
 *
 * `authenticate()`'s default (no `schemes` argument) tries whichever of
 * these were configured in a FIXED `bearer`/`basic`/`token`/`apiKey`/
 * `hmac` order — not the order keys appear on `options`.
 *
 * @throws {RapidError} RAPID_CONFIG when none of `bearer`/`basic`/
 *   `token`/`apiKey`/`hmac` is configured — `authenticate()` would never
 *   be able to identify a caller.
 * @throws {PactDefinitionError} on invalid pact options — see `Pact.create`.
 * @throws {DuplicateVialError} when `pact()` has already run: `Doctor.stock`
 *   refuses a second registration under the same label.
 */
export function pact<P extends PactPermissionBits = PactPermissionBits>(
  options: PactMiddlewareOptions<P>,
): Pact<P> {
  const { bearer, basic, token, apiKey, hmac, ...pactOptions } = options;
  if (
    bearer === undefined && basic === undefined && token === undefined &&
    apiKey === undefined && hmac === undefined
  ) {
    throw new RapidError('RAPID_CONFIG', {
      message:
        'pact() needs at least one scheme configured (bearer/basic/token/apiKey/hmac) — otherwise authenticate() can never identify a caller',
    });
  }
  const instance = Pact.create<P>(
    pactOptions as EventOptionKeys<PactOptions<P>, PactEvents>,
  );
  const schemes: Partial<Record<PactScheme, PactResolvedScheme>> = {};
  if (bearer !== undefined) {
    schemes.BEARER = {
      extract: bearerExtractor(bearer),
      respond: bearer.respond,
    };
  }
  if (basic !== undefined) {
    schemes.BASIC = { extract: basicExtractor(basic), respond: basic.respond };
  }
  if (token !== undefined) {
    schemes.TOKEN = { extract: tokenExtractor(token), respond: token.respond };
  }
  if (apiKey !== undefined) {
    schemes.APIKEY = {
      extract: apiKeyExtractor(apiKey),
      respond: apiKey.respond,
    };
  }
  if (hmac !== undefined) {
    schemes.HMAC = { extract: hmacExtractor(hmac), respond: hmac.respond };
  }
  Doctor.stock(PACT, { pact: instance as unknown as Pact, schemes });
  return instance;
}
