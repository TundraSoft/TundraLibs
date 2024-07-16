export type QueryStatus = 'SUCCESS' | 'ROLLEDBACK' | 'ERROR';

export type Query = {
  id?: string;
  sql: string;
  params?: Record<string, unknown>;
  after?: (result: QueryResult) => Query;
};

export type QueryResult<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  status: QueryStatus;
  data: R[];
  count: number;
  duration: number;
  after?: QueryResult;
};
