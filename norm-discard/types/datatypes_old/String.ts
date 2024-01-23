export type SimpleStringDataType =
  | 'CHAR'
  | 'CHARACTER'
  | 'NCHAR'
  | 'VARCHAR'
  | 'NVARCHAR'
  | 'CHARACTER VARYING'
  | 'TEXT'
  | 'BLOB';

export type UUIDDataType = 'UUID' | 'GUID';

export type StringDataType = SimpleStringDataType | UUIDDataType;
