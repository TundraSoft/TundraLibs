export enum Engines {
  'POSTGRES' = 'POSTGRES',
  'MARIA' = 'MARIA',
  'SQLITE' = 'SQLITE',
  'MONGO' = 'MONGO',
}

export const EngineList = Object.values(Engines);

export type Engine = keyof typeof Engines;

export const assertEngine = (x: unknown): x is Engine => {
  return typeof x === 'string' && EngineList.includes(x as Engines);
};
