import * as asserts from '$asserts';
import {
  decrypt,
  decryptAES,
  encrypt,
  encryptAES,
  type EncryptionModes,
} from './mod.ts';

Deno.test('crypt.encrypt', async (t) => {
  await t.step('AES Encryption/Decryption', async (h) => {
    await h.step('encryptAES - Basic Encryption', async () => {
      const data = 'my data';
      const secret = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
      const mode: EncryptionModes = 'AES-GCM:256';

      const encrypted = await encryptAES(mode, secret, data);
      const decrypted = await decryptAES(mode, secret, encrypted);

      // Check that the encrypted data is a non-empty string
      asserts.assertEquals(typeof encrypted, 'string');
      asserts.assertEquals(encrypted.length > 0, true);
      asserts.assertEquals(decrypted, data);

      // Check the format of the encrypted data
      const encryptedParts = encrypted.split(':');
      asserts.assertEquals(encryptedParts.length, 2);
      asserts.assert(
        /^[0-9a-f]+$/.test(encryptedParts[0]!), // NOSONAR
        'First part should be hex',
      );
      asserts.assert(
        /^[0-9a-f]+$/.test(encryptedParts[1]!), // NOSONAR
        'Second part should be hex',
      );
    });

    await h.step('encryptAES - Empty Input', async () => {
      const data = '';
      const secret = 'abcdefghijklmnopqrstuvwx';
      const mode: EncryptionModes = 'AES-GCM:256';

      const encrypted = await encryptAES(mode, secret, data);
      const decrypted = await decryptAES(mode, secret, encrypted);

      asserts.assertEquals(decrypted, data);
    });

    await h.step('encryptAES - Binary Input', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const secret = 'abcdefghijklmnopqrstuvwx';
      const mode: EncryptionModes = 'AES-GCM:256';

      const encrypted = await encryptAES(mode, secret, data);
      const decrypted = await decryptAES(
        mode,
        secret,
        encrypted,
        true,
      ) as Uint8Array;

      asserts.assert(decrypted instanceof Uint8Array);
      asserts.assertEquals(Array.from(decrypted), [1, 2, 3, 4, 5]);
    });

    await h.step('decryptAES - returnBinary parameter', async () => {
      const data = 'test data';
      const secret = 'abcdefghijklmnopqrstuvwx';
      const mode: EncryptionModes = 'AES-GCM:256';

      const encrypted = await encryptAES(mode, secret, data);
      const decryptedBinary = await decryptAES(mode, secret, encrypted, true);

      asserts.assert(decryptedBinary instanceof Uint8Array);
      const textDecoder = new TextDecoder();
      asserts.assertEquals(
        textDecoder.decode(decryptedBinary as Uint8Array),
        data,
      );
    });

    await h.step('decryptAES - no IV', async () => {
      const data = 'my data';
      const secret = 'abcdefghijklmnopqrstuvwx';
      const mode: EncryptionModes = 'AES-GCM:128';
      const encrypted = await encryptAES(mode, secret, data);

      await asserts.assertRejects(
        async () => {
          await decryptAES(mode, secret, encrypted.split(':')[0]!); // NOSONAR
        },
        Error,
        'Invalid encrypted data format. Expected "data:iv"',
      );
      await asserts.assertRejects(
        async () => {
          await decryptAES(mode, secret, `${encrypted.split(':')[0]}:`);
        },
        Error,
        'Initialization vector (IV) is undefined',
      );
    });
  });

  await t.step('Error Handling', async (h) => {
    await h.step('decryptAES - Invalid Data Format', async () => {
      const secret = 'abcdefghijklmnopqrstuvwx';
      const mode: EncryptionModes = 'AES-GCM:256';
      const invalidData = 'not-valid-format';

      await asserts.assertRejects(
        async () => {
          await decryptAES(mode, secret, invalidData);
        },
        Error,
        'Invalid encrypted data format. Expected "data:iv"',
      );
    });

    await h.step('encryptAES - Invalid Encryption Mode', async () => {
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

    await h.step('encryptAES - Invalid Decryption Mode', async () => {
      const data = 'my data';
      const secret = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
      const mode = 'INVALID-MODE:256' as EncryptionModes;

      await asserts.assertRejects(
        async () => {
          await decryptAES(mode, secret, data);
        },
        Error,
        'Invalid AES encryption mode. Must be AES-GCM or AES-CBC',
      );
    });

    await h.step('encryptAES - Invalid Key Length', async () => {
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
      await asserts.assertRejects(
        async () => {
          await encryptAES('AES-GCM' as EncryptionModes, secret, data);
        },
        Error,
        'Invalid AES key length. Must be 128, 256, 384 or 512',
      );
    });

    await h.step('decryptAES - Invalid Key Length', async () => {
      const data = 'my data';
      const secret = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
      const mode = 'AES-GCM:192' as EncryptionModes; // Invalid key length

      await asserts.assertRejects(
        async () => {
          await decryptAES(mode, secret, data);
        },
        Error,
        'Invalid AES key length. Must be 128, 256, 384 or 512',
      );
      await asserts.assertRejects(
        async () => {
          await decryptAES('AES-GCM' as EncryptionModes, secret, data);
        },
        Error,
        'Invalid AES key length. Must be 128, 256, 384 or 512',
      );
    });
  });

  await t.step('AES-GCM Modes', async (h) => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    await h.step('AES-GCM:128', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-GCM:128',
          secret,
          await encrypt('AES-GCM:128', secret, data),
        ),
        data,
      );
    });

    await h.step('AES-GCM:256', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-GCM:256',
          secret,
          await encrypt('AES-GCM:256', secret, data),
        ),
        data,
      );
    });

    await h.step('AES-GCM:384', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-GCM:384',
          secret,
          await encrypt('AES-GCM:384', secret, data),
        ),
        data,
      );
    });

    await h.step('AES-GCM:512', async () => {
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

  await t.step('AES-CBC Modes', async (h) => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    await h.step('AES-CBC:128', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-CBC:128',
          secret,
          await encrypt('AES-CBC:128', secret, data),
        ),
        data,
      );
    });

    await h.step('AES-CBC:256', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-CBC:256',
          secret,
          await encrypt('AES-CBC:256', secret, data),
        ),
        data,
      );
    });

    await h.step('AES-CBC:384', async () => {
      asserts.assertEquals(
        await decrypt(
          'AES-CBC:384',
          secret,
          await encrypt('AES-CBC:384', secret, data),
        ),
        data,
      );
    });

    await h.step('AES-CBC:512', async () => {
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
