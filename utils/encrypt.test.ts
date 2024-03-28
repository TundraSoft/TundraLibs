import {
  assertEquals,
  assertRejects,
  describe,
  it,
} from '../dev.dependencies.ts';
import { decrypt, encrypt } from './encrypt.ts';

describe('utils', () => {
  describe({ name: 'encrypt' }, () => {
    const key = '1111111111111111';
    const data = { a: 1, b: 2, c: 3 };
    const str = 'Loreum ipsum dolar sit amet';
    const num = 1234567890;
    // const bool = false;
    // const date = new Date();
    const arr = [1, 2, 3, 4, 5];

    describe('invalid options', () => {
      it('invalid algorithm', async () => {
        await assertRejects(
          () =>
            encrypt(
              'data',
              key,
              JSON.parse(
                JSON.stringify({ algorithm: 'invalid', encoding: 'HEX' }),
              ),
            ),
          Error,
          'Invalid algorithm',
        );

        await assertRejects(
          () =>
            decrypt(
              'data',
              key,
              JSON.parse(
                JSON.stringify({ algorithm: 'invalid', encoding: 'HEX' }),
              ),
            ),
          Error,
          'Invalid algorithm',
        );
      });

      it('invalid encoding', async () => {
        await assertRejects(
          () =>
            encrypt(
              'data',
              key,
              JSON.parse(
                JSON.stringify({ algorithm: 'AES-CBC', encoding: 'invalid' }),
              ),
            ),
          Error,
          'Invalid encoding',
        );

        await assertRejects(
          () =>
            decrypt(
              'data',
              key,
              JSON.parse(
                JSON.stringify({ algorithm: 'AES-CBC', encoding: 'invalid' }),
              ),
            ),
          Error,
          'Invalid encoding',
        );
      });
    });

    describe('AES-CBC', () => {
      it('should encrypt and decrypt data', async () => {
        const encrypted = await encrypt(data, key, {
          algorithm: 'AES-CBC',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-CBC',
          encoding: 'HEX',
        });
        assertEquals(decrypted, data);

        const encrypted2 = await encrypt(data, key, {
          algorithm: 'AES-CBC',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-CBC',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, data);
      });

      it('should encrypt and decrypt string', async () => {
        const encrypted = await encrypt(str, key, {
          algorithm: 'AES-CBC',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-CBC',
          encoding: 'HEX',
        });
        assertEquals(decrypted, str);

        const encrypted2 = await encrypt(str, key, {
          algorithm: 'AES-CBC',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-CBC',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, str);
      });

      it('should encrypt and decrypt number', async () => {
        const encrypted = await encrypt(num, key, {
          algorithm: 'AES-CBC',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-CBC',
          encoding: 'HEX',
        });
        assertEquals(decrypted, num);

        const encrypted2 = await encrypt(num, key, {
          algorithm: 'AES-CBC',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-CBC',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, num);
      });

      it('should encrypt and decrypt array', async () => {
        const encrypted = await encrypt(arr, key, {
          algorithm: 'AES-CBC',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-CBC',
          encoding: 'HEX',
        });
        assertEquals(decrypted, arr);

        const encrypted2 = await encrypt(arr, key, {
          algorithm: 'AES-CBC',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-CBC',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, arr);
      });
    });

    describe('AES-CTR', () => {
      it('should encrypt and decrypt data', async () => {
        const encrypted = await encrypt(data, key, {
          algorithm: 'AES-CTR',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-CTR',
          encoding: 'HEX',
        });
        assertEquals(decrypted, data);

        const encrypted2 = await encrypt(data, key, {
          algorithm: 'AES-CTR',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-CTR',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, data);
      });

      it('should encrypt and decrypt string', async () => {
        const encrypted = await encrypt(str, key, {
          algorithm: 'AES-CTR',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-CTR',
          encoding: 'HEX',
        });
        assertEquals(decrypted, str);

        const encrypted2 = await encrypt(str, key, {
          algorithm: 'AES-CTR',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-CTR',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, str);
      });

      it('should encrypt and decrypt number', async () => {
        const encrypted = await encrypt(num, key, {
          algorithm: 'AES-CTR',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-CTR',
          encoding: 'HEX',
        });
        assertEquals(decrypted, num);

        const encrypted2 = await encrypt(num, key, {
          algorithm: 'AES-CTR',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-CTR',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, num);
      });

      it('should encrypt and decrypt array', async () => {
        const encrypted = await encrypt(arr, key, {
          algorithm: 'AES-CTR',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-CTR',
          encoding: 'HEX',
        });
        assertEquals(decrypted, arr);

        const encrypted2 = await encrypt(arr, key, {
          algorithm: 'AES-CTR',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-CTR',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, arr);
      });
    });

    describe('AES-GCM', () => {
      it('should encrypt and decrypt data', async () => {
        const encrypted = await encrypt(data, key, {
          algorithm: 'AES-GCM',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-GCM',
          encoding: 'HEX',
        });
        assertEquals(decrypted, data);

        const encrypted2 = await encrypt(data, key, {
          algorithm: 'AES-GCM',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-GCM',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, data);
      });

      it('should encrypt and decrypt string', async () => {
        const encrypted = await encrypt(str, key, {
          algorithm: 'AES-GCM',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-GCM',
          encoding: 'HEX',
        });
        assertEquals(decrypted, str);

        const encrypted2 = await encrypt(str, key, {
          algorithm: 'AES-GCM',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-GCM',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, str);
      });

      it('should encrypt and decrypt number', async () => {
        const encrypted = await encrypt(num, key, {
          algorithm: 'AES-GCM',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-GCM',
          encoding: 'HEX',
        });
        assertEquals(decrypted, num);

        const encrypted2 = await encrypt(num, key, {
          algorithm: 'AES-GCM',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-GCM',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, num);
      });

      it('should encrypt and decrypt array', async () => {
        const encrypted = await encrypt(arr, key, {
          algorithm: 'AES-GCM',
          encoding: 'HEX',
        });
        const decrypted = await decrypt(encrypted, key, {
          algorithm: 'AES-GCM',
          encoding: 'HEX',
        });
        assertEquals(decrypted, arr);

        const encrypted2 = await encrypt(arr, key, {
          algorithm: 'AES-GCM',
          encoding: 'BASE64',
        });
        const decrypted2 = await decrypt(encrypted2, key, {
          algorithm: 'AES-GCM',
          encoding: 'BASE64',
        });
        assertEquals(decrypted2, arr);
      });
    });
  });
});
