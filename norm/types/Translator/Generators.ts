import { DataTypeMap } from '../DataTypes.ts';

export const Generator = {
  CURRENT_DATE: 'CURRENT_DATE',
  CURRENT_TIME: 'CURRENT_TIME',
  CURRENT_DATETIME: 'CURRENT_DATETIME',
  CURRENT_TIMESTAMP: 'CURRENT_TIMESTAMP',
  NOW: 'NOW',
  UUID: 'UUID',
  SYS_GUID: 'SYS_GUID',
} as const;

export const GeneratorTypeMap = {
  CURRENT_DATE: DataTypeMap.DATE,
  CURRENT_TIME: DataTypeMap.TIME,
  CURRENT_DATETIME: DataTypeMap.DATETIME,
  CURRENT_TIMESTAMP: DataTypeMap.TIMESTAMP,
  NOW: DataTypeMap.TIMESTAMP,
  UUID: DataTypeMap.UUID,
  SYS_GUID: DataTypeMap.UUID,
} as const;

export type Generators = keyof typeof Generator;

export type GeneratorOutput = string | number | bigint | boolean | Date;

export type GeneratorFunction = () => GeneratorOutput;
