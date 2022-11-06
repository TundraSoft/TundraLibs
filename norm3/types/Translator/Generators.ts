export const enum Generator {
  CURRENT_DATE = "CURRENT_DATE",
  CURRENT_TIME = "CURRENT_TIME",
  CURRENT_DATETIME = "CURRENT_DATETIME",
  CURRENT_TIMESTAMP = "CURRENT_TIMESTAMP",
  UUID = "UUID",
  NOW = "NOW",
  SYS_GUID = "SYS_GUID",
}

export type Generators = keyof typeof Generator;

export type GeneratorOutput = string | number | bigint | boolean | Date;

export type GeneratorFunction = () => GeneratorOutput;
