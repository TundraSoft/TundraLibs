import { QueryType } from "./Queries.ts";

export type ClientEvents = {
  connect(name: string): void;
  close(name: string): void;
  query(name: string, type: QueryType): void;
  queryError(name: string, type: QueryType, error: Error): void;
};
