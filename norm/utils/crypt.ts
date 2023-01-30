import { base64 } from '../../dependencies.ts';

export const encrypt = async (key: string, data: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(16)),
    encoder = new TextEncoder(),
    encoded = encoder.encode(data),
    cryptKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      'AES-CBC',
      false,
      ['encrypt'],
    ),
    ecncrypted = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv },
      cryptKey,
      encoded,
    );

  return base64.encode(new Uint8Array(ecncrypted)) + ':' + base64.encode(iv);
  // return new TextDecoder().decode(hexEncode(new Uint8Array(ecncrypted))) + ':' + new TextDecoder().decode(hexEncode(iv));
};

export const decrypt = async (key: string, data: string): Promise<string> => {
  // const [encrypted, iv] = data.split(':').map(d => hexDecode(new TextEncoder().encode(d))),
  const [encrypted, iv] = data.split(':').map((d) => base64.decode(d)),
    decoder = new TextDecoder(),
    encoder = new TextEncoder(),
    cryptKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      'AES-CBC',
      false,
      ['decrypt'],
    ),
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      cryptKey,
      encrypted,
    );

  return decoder.decode(decrypted);
};
