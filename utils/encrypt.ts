import { base64, hex } from '../dependencies.ts';

type EncryptOptions = {
  algorithm: 'AES-CTR' | 'AES-CBC' | 'AES-GCM';
  encoding: 'HEX' | 'BASE64';
};

const defaultOptions: EncryptOptions = {
  algorithm: 'AES-CBC',
  encoding: 'HEX',
};

const enc = new TextEncoder(),
  dec = new TextDecoder();

const isValidEncryptOptions = (x: unknown): x is EncryptOptions => {
  return (
    typeof x === 'object' &&
    x !== null &&
    'algorithm' in x &&
    ['AES-CTR', 'AES-CBC', 'AES-GCM'].includes(
      (x as EncryptOptions).algorithm,
    ) &&
    'encoding' in x &&
    ['HEX', 'BASE64'].includes((x as EncryptOptions).encoding)
  );
};

export const encrypt = async (
  message: unknown,
  key: string,
  opt?: Partial<EncryptOptions>,
): Promise<string> => {
  const encOpt = { ...defaultOptions, ...opt };
  if (!isValidEncryptOptions(encOpt)) {
    throw new Error('Invalid options passed');
  }
  const encopt: {
    name: 'AES-CTR' | 'AES-CBC' | 'AES-GCM';
    counter?: Uint8Array;
    length?: number;
    iv?: Uint8Array;
  } = {
    name: encOpt.algorithm,
  };
  if (encOpt.algorithm === 'AES-CTR') {
    encopt.counter = crypto.getRandomValues(new Uint8Array(16));
    encopt.length = 64;
  } else {
    encopt.iv = crypto.getRandomValues(new Uint8Array(16));
  }
  const cryptKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(key),
      encOpt.algorithm,
      false,
      ['encrypt'],
    ),
    encrypted = await crypto.subtle.encrypt(
      encopt,
      cryptKey,
      enc.encode(JSON.stringify(message)),
    );
  if (encOpt.encoding === 'HEX') {
    return `${hex.encodeHex(encrypted)}:${
      hex.encodeHex(encopt.iv || encopt.counter || '')
    }`;
  } else {
    return `${base64.encodeBase64(encrypted)}:${
      base64.encodeBase64(encopt.iv || encopt.counter || '')
    }`;
  }
};

export const decrypt = async <T>(
  message: string,
  key: string,
  opt?: Partial<EncryptOptions>,
): Promise<T> => {
  const encOpt = { ...defaultOptions, ...opt };
  if (!isValidEncryptOptions(encOpt)) {
    throw new Error('Invalid options passed');
  }
  const spl = message.split(':'),
    iv = encOpt.encoding === 'HEX'
      ? hex.decodeHex(spl[1])
      : base64.decodeBase64(spl[1]),
    encopt: {
      name: 'AES-CTR' | 'AES-CBC' | 'AES-GCM';
      counter?: Uint8Array;
      length?: number;
      iv?: Uint8Array;
    } = {
      name: encOpt.algorithm,
    };
  if (encOpt.algorithm === 'AES-CTR') {
    encopt.counter = iv;
    encopt.length = 64;
  } else {
    encopt.iv = iv;
  }
  const cryptKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(key),
      encOpt.algorithm,
      false,
      ['decrypt'],
    ),
    encrypted = encOpt.encoding === 'HEX'
      ? hex.decodeHex(spl[0])
      : base64.decodeBase64(spl[0]),
    decrypted = await crypto.subtle.decrypt(
      encopt,
      cryptKey,
      encrypted,
    );
  return JSON.parse(dec.decode(decrypted));
};
