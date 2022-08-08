type GeneratorOutput = string | number | bigint | boolean | Date;
export type GeneratorFunction = () => GeneratorOutput;

const genUUID = () => {
  return crypto.randomUUID();
};

export type DefaultValues =
  | keyof Generators
  | GeneratorFunction
  | GeneratorOutput;

export type Generators = {
  "CURRENT_DATE": string | Date | GeneratorFunction;
  "CURRENT_TIME": string | Date | GeneratorFunction;
  "CURRENT_DATETIME": string | Date | GeneratorFunction;
  "CURRENT_TIMESTAMP": string | Date | GeneratorFunction;
  "UUID": string | GeneratorFunction;
};

export const PostgresGenerators: Generators = {
  "CURRENT_DATE": "${CURRENT_DATE}",
  "CURRENT_TIME": "${CURRENT_TIME}",
  "CURRENT_DATETIME": "${CURRENT_DATETIME}",
  "CURRENT_TIMESTAMP": "${CURRENT_TIMESTAMP}",
  "UUID": "${GEN_RANDOM_UUID()}",
};

export const MySQLGenerators: Generators = {
  "CURRENT_DATE": "CURDATE()",
  "CURRENT_TIME": "CURRENT_TIME()",
  "CURRENT_DATETIME": "NOW()",
  "CURRENT_TIMESTAMP": "CURRENT_TIMESTAMP",
  "UUID": "uuid()",
};

export const SqliteGenerators: Generators = {
  "CURRENT_DATE": "DATE('now')",
  "CURRENT_TIME": "TIME('now')",
  "CURRENT_DATETIME": "datetime('now')",
  "CURRENT_TIMESTAMP": "CURRENT_TIMESTAMP",
  "UUID": genUUID,
};

const aa: DefaultValues = "CURRENT_DATE";
if (aa in PostgresGenerators) {
  console.log(PostgresGenerators[aa as keyof typeof PostgresGenerators]);
}
