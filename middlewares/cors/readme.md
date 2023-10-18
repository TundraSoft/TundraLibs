# cors

### Configuring CORS

```typescript
import the {oakCors}

const app = new Application();
app.use(
  oakCors({
    origin: [/^.+localhost:(1234|3000)$/],
  }),
);
app.use(router.routes());

console.info("CORS-enabled web server listening on port 8000");
await app.listen({ port: 8000 });



If you do not want to block REST tools or server-to-server requests, add a
!requestOrigin check in the origin function like so:

```typescript
const corsOptions = {
  origin: (requestOrigin) => {
    if (!requestOrigin) {
      return true;
    } else {
      thrown new Error("Not allowed by CORS");
    }
  },
};
```

### Enabling CORS Pre-Flight

Certain CORS requests are considered 'complex' and require an initial `OPTIONS`
request (called the "pre-flight request"). An example of a 'complex' CORS
request is one that uses an HTTP verb other than GET/HEAD/POST (such as DELETE)
or that uses custom headers. To enable pre-flighting, you must add a new OPTIONS
handler for the route you want to support:

NOTE: When using this middleware as an application level middleware (for
example, `app.use(oakCors())`), pre-flight requests are already handled for all
routes.

## Configuration Options

- `origin`: Configures the **Access-Control-Allow-Origin** CORS header. Possible
  values:
  - `Array` - set `origin` to an array of valid origins. Each origin can be a
    `String` or a `RegExp`. For example
    `["http://example1.com", /\.example2\.com$/]` will accept any request from
    "http://example1.com" or from a subdomain of "example2.com".
- `methods`: Configures the **Access-Control-Allow-Methods** CORS header.
  Expects a comma-delimited string (ex: 'GET,PUT,POST') or an array (ex:
  `['GET', 'PUT', 'POST']`).
- `allowedHeaders`: Configures the **Access-Control-Allow-Headers** CORS header.
  Expects a comma-delimited string (ex: 'Content-Type,Authorization') or an
  array (ex: `['Content-Type', 'Authorization']`). If not specified, defaults to
  reflecting the headers specified in the request's
  **Access-Control-Request-Headers** header.
- `exposedHeaders`: Configures the **Access-Control-Expose-Headers** CORS
  header. Expects a comma-delimited string (ex: 'Content-Range,X-Content-Range')
  or an array (ex: `['Content-Range', 'X-Content-Range']`). If not specified, no
  custom headers are exposed.
- `credentials`: Configures the **Access-Control-Allow-Credentials** CORS
  header. Set to `true` to pass the header, otherwise it is omitted.
- `maxAge`: Configures the **Access-Control-Max-Age** CORS header. Set to an
  integer to pass the header, otherwise it is omitted.
- `preflightContinue`: Pass the CORS preflight response to the next handler.
- `optionsSuccessStatus`: Provides a status code to use for successful `OPTIONS`
  requests, since some legacy browsers (IE11, various SmartTVs) choke on `204`.

The default configuration is the equivalent of:

```json
{
  "origin": "*",
  "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
  "preflightContinue": false,
  "optionsSuccessStatus": 204
}
```

