import { EngineOptions } from '../../../engine/mod.ts';
export type MongoEngineOptions = EngineOptions & {
  authSource?: string;
};
