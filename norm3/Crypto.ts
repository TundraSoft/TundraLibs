// import { encode as hexEncode, decode as hexDecode } from 'https://deno.land/std@0.163.0/encoding/hex.ts';

export enum CryptTypes {
  "AES-GCM" = "AES-GCM",
  "AES-CBC" = "AES-CBC",
  "AES-CTR" = "AES-CTR",
  "AES-OFB" = "AES-OFB",
}

export const KeyLength = {
  128: 128,
  192: 192,
  256: 256,
};

export class Crypt {
  encryptAES(data: string, key: string): string {
  }

  decryptAES(data: string, key: string): string {
  }

  generateKey(mode: CryptTypes): string {
    const key = await crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"],
    );
  }
}

const encrypt = async (key: string, data: string | number): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(16)),
    encoder = new TextEncoder(),
    encoded = encoder.encode(data.toString()),
    cryptKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      "AES-GCM",
      false,
      ["encrypt"],
    ),
    encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      cryptKey,
      encoded,
    );
  console.log(...iv);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted))) + ":" +
    btoa(String.fromCharCode(...iv));
  // return new TextDecoder().decode(hexEncode(new Uint8Array(encrypted)) + ':' + hexEncode(iv));
};

const decrypt = async (key: string, data: string): Promise<string> => {
  const [encrypted, iv] = data.split(":").map((d) => atob(d));
  console.log("d -> ", new TextEncoder().encode(iv));
  const decoder = new TextDecoder(),
    encoder = new TextEncoder(),
    cryptKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      "AES-GCM",
      false,
      ["decrypt"],
    ),
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(encoder.encode(iv)) },
      cryptKey,
      new Uint8Array(encoder.encode(encrypted)),
    );
  return decoder.decode(decrypted);
};

const key = "12345678901234567890123456789012",
  data = "Hello World!",
  encrypted = await encrypt(key, data);

console.log(encrypted);
await decrypt(key, encrypted);
// console.log(await decrypt('12345678901234567890123456789012', 'Q8kNLQGFt07b3O4SWmfiEOu3Q/kGbYHosrWBYA==:cfkJ8eyXd3cmupLD'))
// Q8kNLQGFt07b3O4SWmfiEOu3Q/kGbYHosrWBYA==:cfkJ8eyXd3cmupLD

// const key = await crypto.subtle.generateKey({
//   name: 'AES-GCM',
//   length: 256,
// }, true, ['encrypt', 'decrypt']);

// const key = await crypto.subtle.importKey('jwk', {kty: "oct",
// // k: "fZVwismG0gby7I8bA2T6w-cj9KTnSqt_Kti1aksdlKg",
// k: 'kIo0G+r+7P25HW+KZ27UTXG2RGX9ToELaZm7LdGgqqE',
// alg: "A256GCM",
// key_ops: [ "encrypt", "decrypt" ],
// ext: true}, {name: 'AES-GCM'}, true, ['encrypt', 'decrypt']);

// const iv = crypto.getRandomValues(new Uint8Array(12));

// const encrypted = await crypto.subtle.encrypt({
//   name: 'AES-GCM',
//   iv: crypto.getRandomValues(new Uint8Array(12)),
// }, key, new TextEncoder().encode('Hello World'));

// console.log(btoa(String.fromCharCode(...new Uint8Array(encrypted))));

// console.log(btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key)))));
// console.log((await crypto.subtle.exportKey('raw', key)));

// console.log(new TextEncoder().encode(atob('kIo0G+r+7P25HW+KZ27UTXG2RGX9ToELaZm7LdGgqqE=')));

// const key2 = await crypto.subtle.importKey('raw', new TextEncoder().encode(atob('kIo0G+r+7P25HW+KZ27UTXG2RGX9ToELaZm7LdGgqqE=')), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);

// const encrypted2 = await crypto.subtle.encrypt({
//   name: 'AES-GCM',
//   iv: crypto.getRandomValues(new Uint8Array(12)),
// }, key2, new TextEncoder().encode('Hello World'));

// console.log(encrypted2);
