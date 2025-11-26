import { EngineQueryResult } from './Query.ts';

export type EngineEvents = {
  connect: (instanceId: string) => void; // Emitted when the engine connects to the database
  disconnect: (instanceId: string) => void; // Emitted when the engine disconnects from the database
  query: (
    instanceId: string,
    query: EngineQueryResult,
    error?: Error,
  ) => void; // Emitted when a query is executed
  error: (instanceId: string, error: Error) => void; // Emitted when an error occurs in the engine
};
