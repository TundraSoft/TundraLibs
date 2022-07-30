export type Context = {
  request: Request;
  response: Response;
};
export interface Middleware {
  (context: Context, next: () => Promise<unknown>): Promise<unknown> | unknown;
}
