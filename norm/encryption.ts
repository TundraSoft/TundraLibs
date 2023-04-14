import { createCipheriv, createDecipheriv, randomBytes } from 'npm:crypto';

function encryptData(key: string, plaintext: string): string {
  const iv = randomBytes(12);
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const cipher = createCipheriv('aes-256-gcm', encoder.encode(key), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return `${encrypted.toString('hex')}.${iv.toString('hex')}.${
    cipher.getAuthTag().toString('hex')
  }`;
}

function decryptData(key: string, ciphertext: string): string {
  const [encryptedHex, ivHex, authTagHex] = ciphertext.split('.');
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', encoder.encode(key), iv)
    .setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decoder.decode(decrypted);
}

console.log(encryptData('adfsdfseofuih2349r8ywuihf92fg', 'This is secret'));
