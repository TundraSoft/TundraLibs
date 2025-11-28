export type EngineStatus =
  | 'CLOSED'
  | 'CONNECTING'
  | 'READY'
  | 'WAITING';

export type EngineTransactionStatus =
  | 'ACTIVE'
  | 'COMMITTED'
  | 'ROLLBACK'
  | 'TIMEOUT';
