type ColumnSecurityOptions = 'HASH' | 'ENCRYPT';

type HashSecurityOptions = {
  type: 'HASH';
  mode: 'SHA256' | 'SHA512';
};

type EncryptSecurityOptions = {
  type: 'ENCRYPT';
  mode: 'AES256';
};

export type BaseColumnDefinition = {
  name?: string;
  nullable?: boolean;
  security?: HashSecurityOptions | EncryptSecurityOptions;
  mask?: RegExp;
  comment?: string;
};
