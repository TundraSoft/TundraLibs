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
    });

    await h.step('sign and verify HMAC:SHA-256', async () => {
      const signature = await signHMAC('SHA-256', secret, data);
      asserts.assertEquals(
        await verifyHMAC('SHA-256', secret, data, signature),
        true,
      );
    });

    await h.step('sign and verify HMAC:SHA-384', async () => {
      const signature = await signHMAC('SHA-384', secret, data);
      asserts.assertEquals(
        await verifyHMAC('SHA-384', secret, data, signature),
        true,
      );
    });

    await h.step('sign and verify HMAC:SHA-512', async () => {
      const signature = await signHMAC('SHA-512', secret, data);
      asserts.assertEquals(
        await verifyHMAC('SHA-512', secret, data, signature),
        true,
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
  });

  await t.step('sign and verify', async () => {
    const secret = 'abcdefghijklmnopqrstuvwx';
    const data = 'my data';
    const signature = await sign('HMAC:SHA-256', secret, data);
    asserts.assertEquals(
      await verify('HMAC:SHA-256', secret, data, signature),
      true,
    );
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
