import { Status } from "../../dependencies.ts";

export type HTTPResponse<T = Record<string, unknown>> = {
  status: Status;
  payload?: T | Array<T>;
  pagination?: {
    limit: number;
    page: number;
  };
  totalRows: number;
  headers?: Headers;
};
