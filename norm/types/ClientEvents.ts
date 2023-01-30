export type ClientEvents = {
  connect(name: string): void;
  disconnect(name: string): void;
  error(name: string, error: Error): void;
  query(name: string, query: string, params: unknown[]): void;
  // longQuery(name: string, type: QueryType, query: string, time: number): void;
};
