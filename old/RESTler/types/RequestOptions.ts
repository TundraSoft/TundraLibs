import { HTTPMethods } from '../../dependencies.ts';

// export type RequestOptions<RequestBody> = {
//   body?: RequestBody | RequestBody[];
//   headers?: Headers;
//   method: HTTPMethods;
//   endPoint: string;
//   searchParams?: URLSearchParams;
// };

export type RequestBody = Record<string, unknown> | FormData;

export type RequestOptions<RequestBody> = {
  body?: RequestBody | RequestBody[] | FormData;
  version?: string;
  headers?: Headers;
  method: HTTPMethods;
  endPoint: string;
  searchParams?: URLSearchParams;
};
