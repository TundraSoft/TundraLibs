import { Status } from "../../dependencies.ts";

export type HTTPResponse<T = Record<string, unknown>> = {
  status: Status, 
  body?: Array<T> | T
  headers?: Headers
}
