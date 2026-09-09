/**
 * @fileoverview isSocketOriginAllowed — the upgrade origin policy.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { isSocketOriginAllowed } from './socketOrigin.ts';

const upgrade = (headers: Record<string, string>) =>
  new Request('http://app.example/ws', { headers });

describe('rapid.utils.isSocketOriginAllowed', () => {
  it('no Origin (a non-browser client) passes; the request host passes; another host is refused', () => {
    const none = new Set<string>();
    asserts.assertEquals(
      isSocketOriginAllowed(upgrade({ host: 'app.example' }), none),
      true,
    );
    asserts.assertEquals(
      isSocketOriginAllowed(
        upgrade({ host: 'app.example', origin: 'https://app.example' }),
        none,
      ),
      true,
    );
    asserts.assertEquals(
      isSocketOriginAllowed(
        upgrade({ host: 'App.Example:443', origin: 'https://app.example:443' }),
        none,
      ),
      true,
    );
    asserts.assertEquals(
      isSocketOriginAllowed(
        upgrade({ host: 'app.example', origin: 'https://evil.example' }),
        none,
      ),
      false,
    );
  });

  it('a listed origin passes exactly; the opaque origin and garbage are refused', () => {
    const allowed = new Set(['https://spa.example']);
    asserts.assertEquals(
      isSocketOriginAllowed(
        upgrade({ host: 'api.example', origin: 'https://spa.example' }),
        allowed,
      ),
      true,
    );
    asserts.assertEquals(
      isSocketOriginAllowed(
        upgrade({ host: 'api.example', origin: 'http://spa.example' }),
        allowed,
      ),
      false,
    );
    for (const origin of ['null', 'not a url', 'file://']) {
      asserts.assertEquals(
        isSocketOriginAllowed(
          upgrade({ host: 'api.example', origin }),
          allowed,
        ),
        false,
        origin,
      );
    }
  });
});
