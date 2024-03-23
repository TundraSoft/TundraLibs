type HashSecurityOptions = {
  type: 'HASH';
  mode: 'SHA256' | 'SHA512';
};

type EncryptSecurityOptions = {
  type: 'ENCRYPT';
  algorithm: 'AES256'; // | 'AES512';
};

export type BaseColumnDefinition = {
  name?: string;
  nullable?: boolean;
  disableUpdate?: boolean;
  security?: HashSecurityOptions | EncryptSecurityOptions;
  comment?: string;
};
