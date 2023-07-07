import { Status } from '../../dependencies.ts';

// export type ResponseObject<ResponseBody extends Record<string, unknown> = Record<string, unknown>> = {
//   endpoint: string;
//   url: string;
//   status: Status;
//   headers: Headers;
//   body?: ResponseBody;
// };

export type ResponseBody = Record<string, unknown>;

export type ResponseObject<ResponseBody> = {
  endpoint: string;
  url: string;
  status: Status;
  headers: Headers;
  body?: ResponseBody;
};
