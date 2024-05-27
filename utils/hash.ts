import { base64, hex } from '../dependencies.ts';

type HashOptions = {
  algorithm: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  encoding: 'HEX' | 'BASE64';
};

const defOptions: HashOptions = {
  algorithm: 'SHA-256',
  encoding: 'HEX',
};

const isValidHashOptions = (x: unknown): x is HashOptions => {
  return (
    typeof x === 'object' &&
    x !== null &&
    'algorithm' in x &&
    ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(
      (x as HashOptions).algorithm,
    ) &&
    'encoding' in x &&
    ['HEX', 'BASE64'].includes((x as HashOptions).encoding)
  );
};

export const hash = async (
  data: unknown,
  opt: HashOptions = defOptions,
): Promise<string> => {
  opt = { ...defOptions, ...opt };
  if (!isValidHashOptions(opt)) {
    throw new Error('Invalid options passed');
  }
  const dataString = JSON.stringify(data);
  const hash = await crypto.subtle.digest(
    opt.algorithm,
    new TextEncoder().encode(dataString),
  );
  return (opt.encoding === 'HEX')
    ? hex.encodeHex(new Uint8Array(hash))
    : base64.encodeBase64(new Uint8Array(hash));
};
