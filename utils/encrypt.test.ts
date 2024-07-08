import { asserts } from '../dev.dependencies.ts';
import { decrypt, encrypt } from './encrypt.ts';

Deno.test('utils:encrypt', async (t) => {
  const key = '1111111111111111';
  const data = { a: 1, b: 2, c: 3 };
  const str = 'Loreum ipsum dolar sit amet';
  const num = 1234567890;
  const arr = [1, 2, 3, 4, 5];

  await t.step('invalid configuration', async (t) => {
    await t.step('invalid algorithm', async () => {
      await asserts.assertRejects(
        () =>
          encrypt(
            'data',
            key,
            JSON.parse(
              JSON.stringify({ algorithm: 'invalid', encoding: 'HEX' }),
            ),
          ),
        Error,
        'Invalid options passed',
      );

      await asserts.assertRejects(
        () =>
          decrypt(
            'data',
            key,
            JSON.parse(
              JSON.stringify({ algorithm: 'invalid', encoding: 'HEX' }),
            ),
          ),
        Error,
        'Invalid options passed',
      );
    });

    await t.step('invalid encoding', async () => {
      await asserts.assertRejects(
        () =>
          encrypt(
            'data',
            key,
            JSON.parse(
              JSON.stringify({ algorithm: 'AES-CBC', encoding: 'invalid' }),
            ),
          ),
        Error,
        'Invalid options passed',
      );

      await asserts.assertRejects(
        () =>
          decrypt(
            'data',
            key,
            JSON.parse(
              JSON.stringify({ algorithm: 'AES-CBC', encoding: 'invalid' }),
            ),
          ),
        Error,
        'Invalid options passed',
      );
    });
  });

  await t.step('AES-CBC', async (t) => {
    await t.step('should encrypt and decrypt data', async () => {
      const encrypted = await encrypt(data, key, {
        algorithm: 'AES-CBC',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-CBC',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, data);

      const encrypted2 = await encrypt(data, key, {
        algorithm: 'AES-CBC',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-CBC',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, data);
    });

    await t.step('should encrypt and decrypt string', async () => {
      const encrypted = await encrypt(str, key, {
        algorithm: 'AES-CBC',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-CBC',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, str);

      const encrypted2 = await encrypt(str, key, {
        algorithm: 'AES-CBC',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-CBC',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, str);
    });

    await t.step('should encrypt and decrypt number', async () => {
      const encrypted = await encrypt(num, key, {
        algorithm: 'AES-CBC',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-CBC',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, num);

      const encrypted2 = await encrypt(num, key, {
        algorithm: 'AES-CBC',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-CBC',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, num);
    });

    await t.step('should encrypt and decrypt array', async () => {
      const encrypted = await encrypt(arr, key, {
        algorithm: 'AES-CBC',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-CBC',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, arr);

      const encrypted2 = await encrypt(arr, key, {
        algorithm: 'AES-CBC',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-CBC',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, arr);
    });
  });

  await t.step('AES-CTR', async (t) => {
    await t.step('should encrypt and decrypt data', async () => {
      const encrypted = await encrypt(data, key, {
        algorithm: 'AES-CTR',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-CTR',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, data);

      const encrypted2 = await encrypt(data, key, {
        algorithm: 'AES-CTR',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-CTR',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, data);
    });

    await t.step('should encrypt and decrypt string', async () => {
      const encrypted = await encrypt(str, key, {
        algorithm: 'AES-CTR',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-CTR',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, str);

      const encrypted2 = await encrypt(str, key, {
        algorithm: 'AES-CTR',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-CTR',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, str);
    });

    await t.step('should encrypt and decrypt number', async () => {
      const encrypted = await encrypt(num, key, {
        algorithm: 'AES-CTR',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-CTR',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, num);

      const encrypted2 = await encrypt(num, key, {
        algorithm: 'AES-CTR',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-CTR',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, num);
    });

    await t.step('should encrypt and decrypt array', async () => {
      const encrypted = await encrypt(arr, key, {
        algorithm: 'AES-CTR',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-CTR',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, arr);

      const encrypted2 = await encrypt(arr, key, {
        algorithm: 'AES-CTR',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-CTR',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, arr);
    });
  });

  await t.step('AES-GCM', async (t) => {
    await t.step('should encrypt and decrypt data', async () => {
      const encrypted = await encrypt(data, key, {
        algorithm: 'AES-GCM',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-GCM',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, data);

      const encrypted2 = await encrypt(data, key, {
        algorithm: 'AES-GCM',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-GCM',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, data);
    });

    await t.step('should encrypt and decrypt string', async () => {
      const encrypted = await encrypt(str, key, {
        algorithm: 'AES-GCM',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-GCM',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, str);

      const encrypted2 = await encrypt(str, key, {
        algorithm: 'AES-GCM',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-GCM',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, str);
    });

    await t.step('should encrypt and decrypt number', async () => {
      const encrypted = await encrypt(num, key, {
        algorithm: 'AES-GCM',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-GCM',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, num);

      const encrypted2 = await encrypt(num, key, {
        algorithm: 'AES-GCM',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-GCM',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, num);
    });

    await t.step('should encrypt and decrypt array', async () => {
      const encrypted = await encrypt(arr, key, {
        algorithm: 'AES-GCM',
        encoding: 'HEX',
      });
      const decrypted = await decrypt(encrypted, key, {
        algorithm: 'AES-GCM',
        encoding: 'HEX',
      });
      asserts.assertEquals(decrypted, arr);

      const encrypted2 = await encrypt(arr, key, {
        algorithm: 'AES-GCM',
        encoding: 'BASE64',
      });
      const decrypted2 = await decrypt(encrypted2, key, {
        algorithm: 'AES-GCM',
        encoding: 'BASE64',
      });
      asserts.assertEquals(decrypted2, arr);
    });
  });
});
