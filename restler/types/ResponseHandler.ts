import type { RESTlerResponse, RESTlerResponseBody } from './Response.ts';
export type RESTlerResponseHandler = <
  RespBody extends RESTlerResponseBody = RESTlerResponseBody,
>(
  response: RESTlerResponse<RespBody>,
) => RESTlerResponse<RespBody> | Promise<RESTlerResponse<RespBody>>;
