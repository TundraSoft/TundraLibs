import * as asserts from '$asserts';
import {
  type DigestAlgorithms,
  sign,
  signHMAC,
  type SigningModes,
  verify,
  verifyHMAC,
} from './mod.ts';

Deno.test('signing', async (t) => {
  await t.step('sign and verify HMAC', async (h) => {
    const secret = 'abcdefghijklmnopqrstuvwx';
    const data = 'my data';

    await h.step('sign and verify HMAC:SHA-1', async () => {
      const signature = await signHMAC('SHA-1', secret, data);
      asserts.assertEquals(
        await verifyHMAC('SHA-1', secret, data, signature),
        true,
      );
      // Verify against a known test vector
      asserts.assertEquals(
        signature,
        'cd02551761ed331daf90a78386a9613f19b55604',
      );
    });

    await h.step('sign and verify HMAC:SHA-256', async () => {
      const signature = await signHMAC('SHA-256', secret, data);
      asserts.assertEquals(
        await verifyHMAC('SHA-256', secret, data, signature),
        true,
      );
      // Verify against a known test vector
      asserts.assertEquals(
        signature,
        '5a45d6d13019b54096f18218194c22cc7fb126c800d4c5c6f4c8bebd16dc32e5',
      );
    });

    await h.step('sign and verify HMAC:SHA-384', async () => {
      const signature = await signHMAC('SHA-384', secret, data);
      asserts.assertEquals(
        await verifyHMAC('SHA-384', secret, data, signature),
        true,
      );
      // Verify against a known test vector
      asserts.assertEquals(
        signature,
        'f2e3560b29ee01dc41ad1c2f6da4d6334a5e40780bb2ebee9b73d15820646c5fa6af8ceec8e1913fb8c7223cba81b7ff',
      );
    });

    await h.step('sign and verify HMAC:SHA-512', async () => {
      const signature = await signHMAC('SHA-512', secret, data);
      asserts.assertEquals(
        await verifyHMAC('SHA-512', secret, data, signature),
        true,
      );
      // Verify against a known test vector
      asserts.assertEquals(
        signature,
        '1d03df3605d4631e3094093e6886d1f151c2c39adb170cbe2c6747f0507ce59e44d68561faff01430310abb738b29479402bef6c4e3d604a4b4cb56bf4718a7c',
      );
    });

    await h.step('sign and verify with binary data', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = await signHMAC('SHA-256', secret, binaryData);
      asserts.assertEquals(
        await verifyHMAC('SHA-256', secret, binaryData, signature),
        true,
      );
      // Verify against a known test vector
      asserts.assertEquals(
        signature,
        '65dad081124051a98c32a21837e848791412858af92b1bd68a326f5c2bea755b',
      );
    });

    await h.step('sign and verify with empty data', async () => {
      const emptyData = '';
      const signature = await signHMAC('SHA-256', secret, emptyData);
      asserts.assertEquals(
        await verifyHMAC('SHA-256', secret, emptyData, signature),
        true,
      );
      // Verify against a known test vector
      asserts.assertEquals(
        signature,
        'c58318d62aa0ef514fff9e7facff8fafa576e31922f76cf479d1e5856834e5b9',
      );
    });

    await h.step('invalid HMAC hash', () => {
      asserts.assertRejects(
        async () =>
          await signHMAC('SHA-1024' as DigestAlgorithms, secret, data),
        Error,
      );
      asserts.assertRejects(
        async () =>
          await verifyHMAC(
            'SHA-1024' as DigestAlgorithms,
            secret,
            data,
            '1d03df3605d4631e3094093e6886d1f151c2c39adb170cbe2c6747f0507ce59e44d68561faff01430310abb738b29479402bef6c4e3d604a4b4cb56bf4718a7c',
          ),
        Error,
      );
    });

    await h.step('invalid signature format', async () => {
      await asserts.assertRejects(
        async () => {
          await verifyHMAC('SHA-256', secret, data, 'not-a-hex-string');
        },
        Error,
        'Invalid signature format',
      );
    });
  });

  await t.step('sign and verify with wrapper functions', async (h) => {
    const secret = 'abcdefghijklmnopqrstuvwx';
    const data = 'my data';

    await h.step('test with string data', async () => {
      const signature = await sign('HMAC:SHA-256', secret, data);
      asserts.assertEquals(
        await verify('HMAC:SHA-256', secret, data, signature),
        true,
      );
    });

    await h.step('test with binary data', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = await sign('HMAC:SHA-256', secret, binaryData);
      asserts.assertEquals(
        await verify('HMAC:SHA-256', secret, binaryData, signature),
        true,
      );
    });
  });

  await t.step('sign and verify with invalid signature', async () => {
    const secret = 'abcdefghijklmnopqrstuvwx';
    const data = 'my data';
    const signature = await sign('HMAC:SHA-256', secret, data);
    asserts.assertEquals(
      await verify('HMAC:SHA-256', secret, data, signature.replace('a', 'c')),
      false,
    );
  });

  await t.step('sign and verify with invalid secret', async () => {
    const secret = 'abcdefghijklmnopqrstuvwx';
    const data = 'my data';
    const signature = await sign('HMAC:SHA-256', secret, data);
    asserts.assertEquals(
      await verify('HMAC:SHA-256', secret.replace('a', 'b'), data, signature),
      false,
    );
  });

  await t.step('sign and verify with invalid data', async () => {
    const secret = 'abcdefghijklmnopqrstuvwx';
    const data = 'my data';
    const signature = await sign('HMAC:SHA-256', secret, data);
    asserts.assertEquals(
      await verify('HMAC:SHA-256', secret, data.replace('a', 'b'), signature),
      false,
    );
  });

  await t.step('sign and verify with invalid mode', async () => {
    const secret = 'abcdefghijklmnopqrstuvwx';
    const data = 'my data';
    const signature = await sign('HMAC:SHA-1', secret, data);
    asserts.assertRejects(
      async () =>
        await sign(
          'HMAC:HMAC:SHA-1' as SigningModes,
          secret,
          data,
        ),
      Error,
    );
    asserts.assertRejects(
      async () =>
        await sign(
          'ABC:SHA-1' as SigningModes,
          secret,
          data,
        ),
      Error,
    );
    asserts.assertRejects(
      async () =>
        await sign(
          'HMAC:SHA-1024' as SigningModes,
          secret,
          data,
        ),
      Error,
    );

    asserts.assertRejects(
      async () =>
        await verify(
          'HMAC:HMAC:SHA-1' as SigningModes,
          secret,
          data,
          signature,
        ),
      Error,
    );
    asserts.assertRejects(
      async () =>
        await verify(
          'ABC:SHA-1' as SigningModes,
          secret,
          data,
          signature,
        ),
      Error,
    );
    asserts.assertRejects(
      async () =>
        await verify(
          'HMAC:SHA-1024' as SigningModes,
          secret,
          data,
          signature,
        ),
      Error,
    );
  });
});
