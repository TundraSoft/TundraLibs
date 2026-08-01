/**
 * @fileoverview Tests for the package root barrel (`mod.ts`).
 *
 * Guards that the headline API is re-exported as a runtime VALUE, not
 * type-only. A `type`-only re-export is erased at runtime, so consumers
 * doing `import { WebServer } from '@tundralibs/compat'` would receive
 * `undefined` and `new WebServer(...)` would throw "not a constructor".
 *
 * @module
 */

import { describe, it } from './test.ts';
import * as asserts from '@std/asserts';
import { WebServer } from './mod.ts';
import * as compat from './mod.ts';

describe('compat.mod (root barrel)', () => {
  it('re-exports WebServer as a runtime value (not type-only)', () => {
    // A type-only re-export is erased at runtime -> `undefined`.
    asserts.assertEquals(
      typeof WebServer,
      'function',
      'WebServer must be re-exported as a value from the package root',
    );
    asserts.assert(
      compat.WebServer !== undefined,
      'compat.WebServer must be defined on the namespace import',
    );
    asserts.assertStrictEquals(compat.WebServer, WebServer);
  });

  it('allows `new WebServer(...)` from the package root', () => {
    const server = new WebServer('RootExportTest', {
      mode: 'TCP',
      port: 8080,
      handler: () => new Response('ok'),
    });
    asserts.assert(
      server instanceof WebServer,
      'construction from the root export must succeed',
    );
    asserts.assertEquals(server.name, 'RootExportTest');
    asserts.assertEquals(server.mode, 'TCP');
  });
});
