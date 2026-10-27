/**
 * What `fetch()` asks for. `uid` is always returned. `body` is
 * `BODY.PEEK[]` (the whole raw message, without setting `\Seen`),
 * `header` is `BODY.PEEK[HEADER]`, `size` is `RFC822.SIZE`.
 */
export type ImapFetchItem =
  | 'flags'
  | 'internalDate'
  | 'size'
  | 'envelope'
  | 'body'
  | 'header';
