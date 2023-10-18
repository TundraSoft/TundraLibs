import type { RESTlerRequest, RESTlerResponse } from './mod.ts';

export type RESTlerEvents = {
  request: (request: RESTlerRequest) => void;
  response: (request: RESTlerRequest, response: RESTlerResponse) => void;
  authFailure: () => void;
  timeout: () => void;
  error: () => void;
};
