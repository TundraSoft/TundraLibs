export enum Engines {
  'MEMORY' = 'MEMORY',
  'REDIS' = 'REDIS',
  'MEMCACHED' = 'MEMCACHED',
}

export type Engine = keyof typeof Engines;

export const EngineList: Array<Engine> = Object.values(Engines);

export const assertEngine = (x: unknown): x is Engine => {
  return typeof x === 'string' && EngineList.includes(x as Engines);
};
