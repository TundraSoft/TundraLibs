import * as asserts from '$asserts';
import {
  decrypt,
  decryptAES,
  encrypt,
  encryptAES,
  type EncryptionModes,
} from './mod.ts';

Deno.test('encryption', async (t) => {
  await t.step('encryptAES - Basic Encryption', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);
    const decrypted = await decryptAES(mode, secret, encrypted);
    //console.log(encrypted); // Logs the encrypted data and IV

    // Check that the encrypted data is a non-empty string
    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);
    asserts.assertEquals(decrypted, data);
  });

  await t.step('encryptAES - Invalid Encryption Mode', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
    const mode = 'INVALID-MODE:256' as EncryptionModes;

    await asserts.assertRejects(
      async () => {
        await encryptAES(mode, secret, data);
      },
      Error,
      'Invalid AES encryption mode. Must be AES-GCM or AES-CBC',
    );
  });

  await t.step('encryptAES - Invalid Key Length', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
    const mode = 'AES-GCM:192' as EncryptionModes; // Invalid key length

    await asserts.assertRejects(
      async () => {
        await encryptAES(mode, secret, data);
      },
      Error,
      'Invalid AES key length. Must be 128, 256, 384 or 512',
    );
  });

  await t.step('encryptAES - Invalid Secret Length', async () => {
    const data = 'my data';
    const secret = 'short'; // 5 bytes (40 bits)
    const mode: EncryptionModes = 'AES-GCM:128';

    await asserts.assertRejects(
      async () => {
        await encryptAES(mode, secret, data);
      },
      Error,
      'Invalid key length',
    );
  });

  await t.step('test aes-gcm modes', async (t2) => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    await t2.step('AES-GCM:128', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-GCM:128',
          secret,
          await encrypt('AES-GCM:128', secret, data),
        ),
        data,
      );
    });
    await t2.step('AES-GCM:256', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-GCM:256',
          secret,
          await encrypt('AES-GCM:256', secret, data),
        ),
        data,
      );
    });
    await t2.step('AES-GCM:384', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-GCM:384',
          secret,
          await encrypt('AES-GCM:384', secret, data),
        ),
        data,
      );
    });
    await t2.step('AES-GCM:512', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-GCM:512',
          secret,
          await encrypt('AES-GCM:512', secret, data),
        ),
        data,
      );
    });
  });

  await t.step('test aes-cbc modes', async (t2) => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    await t2.step('AES-CBC:128', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-CBC:128',
          secret,
          await encrypt('AES-CBC:128', secret, data),
        ),
        data,
      );
    });
    await t2.step('AES-CBC:256', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-CBC:256',
          secret,
          await encrypt('AES-CBC:256', secret, data),
        ),
        data,
      );
    });
    await t2.step('AES-CBC:384', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-CBC:384',
          secret,
          await encrypt('AES-CBC:384', secret, data),
        ),
        data,
      );
    });
    await t2.step('AES-CBC:512', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-CBC:512',
          secret,
          await encrypt('AES-CBC:512', secret, data),
        ),
        data,
      );
    });
  });
});
