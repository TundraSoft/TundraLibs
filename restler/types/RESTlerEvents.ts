import { RESTlerBaseError } from '../mod.ts';
import type { RESTlerRequest, RESTlerResponse } from './mod.ts';

export type RESTlerEvents = {
  auth: <T extends unknown = unknown>(authInfo: T) => void;
  authFailure: (request: RESTlerRequest) => void;
  log<
    _RequestBody = Record<string, unknown>,
    ResponseBody = Record<string, unknown>,
  >(
    request: RESTlerRequest,
    response?: RESTlerResponse<ResponseBody>,
    timeTaken?: number,
    isTimedOut?: boolean,
  ): void;
  response: (
    request: RESTlerRequest,
    response: RESTlerResponse,
    error?: RESTlerBaseError,
  ) => void;
  request: (request: RESTlerRequest) => void;
  timeout: (request: RESTlerRequest) => void;
};
