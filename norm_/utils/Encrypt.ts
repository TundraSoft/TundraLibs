import { base64, hex, openpgp } from '../dependencies.ts';

type EncryptOptions = {
  algorithm: 'AES-128' | 'AES-192' | 'AES-256';
  compression?: 'ZIP' | 'ZLIB' | 'UNCOMPRESSED';
  encoding: 'HEX' | 'BASE64';
};

export const encrypt = async (
  message: unknown,
  key: string,
  encoding: 'HEX' | 'BASE64',
): Promise<string> => {
  const data = await openpgp.createMessage({
      text: JSON.stringify(message),
    }),
    encryptedBinary = await openpgp.encrypt({
      data,
      passwords: key,
      format: 'binary',
      config: {
        preferredSymmetricAlgorithm: openpgp.enums.symmetric.aes256,
        preferredCompressionAlgorithm: openpgp.enums.compression.zip,
      },
    });
  return encoding === 'HEX'
    ? hex.encodeHex(encryptedBinary)
    : base64.encodeBase64(encryptedBinary);
};

export const decrypt = async <T extends unknown = unknown>(
  message: string,
  key: string,
  encoding: 'HEX' | 'BASE64',
): Promise<T> => {
  const encryptedBinary = encoding === 'HEX'
      ? hex.decodeHex(message)
      : base64.decodeBase64(message),
    decrypted = await openpgp.decrypt({
      message: await openpgp.readMessage({ binary: encryptedBinary }),
      passwords: key,
    });
  return JSON.parse(decrypted.data);
};
