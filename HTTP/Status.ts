export type STATUS_CODES = {
  100: "continue";
  101: "switching protocols";
  102: "processing";
  103: "early hints";
  200: "ok";
  201: "created";
  202: "accepted";
  203: "non-authoritative information";
  204: "no content";
  205: "reset content";
  206: "partial content";
  207: "multi status";
  208: "already reported";
  226: "im used";
  300: "multiple choice";
  301: "moved permanently";
  302: "found";
  303: "see other";
  304: "not modified";
  305: "use proxy";
  307: "temporary redirect";
  308: "permanent redirect";
  400: "bad request";
  401: "unauthorized";
  402: "payment required";
  403: "forbidden";
  404: "not found";
  405: "method not allowed";
  406: "not acceptable";
  407: "proxy authentication required";
  408: "request timeout";
  409: "conflict";
  410: "gone";
  411: "length required";
  412: "precondition failed";
  413: "payload too large";
  414: "uri too long";
  415: "unsupported media type";
  416: "range not satisfiable";
  417: "expectation failed";
  418: "im a teapot";
  421: "misdirected request";
  422: "unprocessable entity";
  423: "locked";
  424: "failed dependency";
  425: "too early";
  426: "upgrade required";
  428: "precondition required";
  429: "too many requests";
  431: "request header fields too large";
  451: "unavailable for legal reasons";
  500: "internal server error";
  501: "not implemented";
  502: "bad gateway";
  503: "service unavailable";
  504: "gateway timeout";
  505: "http version not supported";
  506: "variant also negotiates";
  507: "insufficient storage";
  508: "loop detected";
  510: "not extended";
  511: "network authentication required";
};

export const enum STATUS_MAP {
  "continue" = 100,
  "switching protocols" = 101,
  "processing" = 102,
  "early hints" = 103,
  "ok" = 200,
  "created" = 201,
  "accepted" = 202,
  "non-authoritative information" = 203,
  "no content" = 204,
  "reset content" = 205,
  "partial content" = 206,
  "multi status" = 207,
  "already reported" = 208,
  "im used" = 226,
  "multiple choice" = 300,
  "moved permanently" = 301,
  "found" = 302,
  "see other" = 303,
  "not modified" = 304,
  "use proxy" = 305,
  "temporary redirect" = 307,
  "permanent redirect" = 308,
  "bad request" = 400,
  "unauthorized" = 401,
  "payment required" = 402,
  "forbidden" = 403,
  "not found" = 404,
  "method not allowed" = 405,
  "not acceptable" = 406,
  "proxy authentication required" = 407,
  "request timeout" = 408,
  "conflict" = 409,
  "gone" = 410,
  "length required" = 411,
  "precondition failed" = 412,
  "payload too large" = 413,
  "uri too long" = 414,
  "unsupported media type" = 415,
  "range not satisfiable" = 416,
  "expectation failed" = 417,
  "im a teapot" = 418,
  "misdirected request" = 421,
  "unprocessable entity" = 422,
  "locked" = 423,
  "failed dependency" = 424,
  "too early" = 425,
  "upgrade required" = 426,
  "precondition required" = 428,
  "too many requests" = 429,
  "request header fields too large" = 431,
  "unavailable for legal reasons" = 451,
  "internal server error" = 500,
  "not implemented" = 501,
  "bad gateway" = 502,
  "service unavailable" = 503,
  "gateway timeout" = 504,
  "http version not supported" = 505,
  "variant also negotiates" = 506,
  "insufficient storage" = 507,
  "loop detected" = 508,
  "not extended" = 510,
  "network authentication required" = 511,
}
