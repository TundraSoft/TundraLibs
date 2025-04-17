export enum Engines {
  'MEMORY' = 'MEMORY',
  'REDIS' = 'REDIS',
  'MEMCACHED' = 'MEMCACHED',
}

export const EngineList = Object.values(Engines);

export type Engine = keyof typeof Engines;

export const assertEngine = (x: unknown): x is Engine => {
  return typeof x === 'string' && EngineList.includes(x as Engines);
};
