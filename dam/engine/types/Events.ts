import { EngineQueryResult } from './Query.ts';

export type EngineEvents = {
  connect: (instanceId: string) => void; // Emitted when the engine connects to the database
  disconnect: (instanceId: string) => void; // Emitted when the engine disconnects from the database
  connectionFailed: (instanceId: string, error: Error) => void; // Emitted when the engine fails to connect to the database
  transactionBegin: (instanceId: string, transactionId: string) => void; // Emitted when a transaction begins
  transactionCommit: (instanceId: string, transactionId: string) => void; // Emitted when a transaction is committed
  transactionRollback: (instanceId: string, transactionId: string) => void; // Emitted when a transaction is rolled back
  transactionTimeout: (instanceId: string, transactionId: string) => void; // Emitted when a transaction times out
  query: (instanceId: string, query: EngineQueryResult) => void; // Emitted when a query is executed successfully
  slowQuery: (instanceId: string, query: EngineQueryResult) => void; // Emitted when a query exceeds the slow query threshold
  error: (instanceId: string, error: Error) => void; // Emitted when an error occurs in the engine
  warn: (instanceId: string, message: string) => void; // Emitted for warning messages
};
