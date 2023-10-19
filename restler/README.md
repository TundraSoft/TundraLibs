# RESTler

`RESTler` is an abstract class representing a RESTful HTTP client. It provides several helper methods to streamline the process of making requests and handling responses.

## Methods

### `constructor(name: string, config: OptionKeys<O, RESTlerEvents>)`

This is the constructor method for the class, initializing essential properties such as `_name` and `_defaultHeaders`.

It takes two parameters:

1. `name`: A string that represents the name of the instance.
2. `config`: An object of type `OptionKeys`.

---

### `_buildEndpoint(method: HTTPMethods, location: string, searchParams?: Record<string, string>, version?: string)`

This is a protected helper method to build the `RESTlerEndpoint` object.

It takes four parameters:

1. `method`: The HTTP Method of type `HTTPMethods`.
2. `location`: The URL path string.
3. `searchParams`: An optional parameter representing the URL search parameters.
4. `version`: An optional parameter representing the API version.

---

### `_makeURL(endpoint: RESTlerEndpoint)`

This protected method creates a URL string from the given `RESTlerEndpoint` object.

It takes one parameter `endpoint`: The `RESTlerEndpoint` object.

---

### `_makeRequest(request: RESTlerRequest<ReqBody>)`

This protected asynchronous method makes the API call based on provided configuration.

It performs operation such as injection of default headers, performs auth injection and retries the request if authentication fails (401).

It has only one parameter:

1. `request`: The `RESTlerRequest` object.

---

### `_handleResponse(request: RESTlerRequest<ReqBody>, response: RESTlerResponse<RespBody>)`

An abstract method, to be overridden in derived classes, intended to handle responses received from API requests.

It accepts two parameters:

1. `request`: The `RESTlerRequest` object.
2. `response`: The `RESTlerResponse` object.

---

### `_authInjector(request: RESTlerRequest<ReqBody>)`

An abstract method for injecting authorization details into the request. This method is meant to be overridden in inheriting classes, providing custom authentication logic.

It takes one argument `request`: The `RESTlerRequest` object.

---

### `_authenticate()`

An abstract asynchronous method intended to perform authentication. It doesn't accept any parameters. This method is meant to be overridden in an inheriting class to provide specific implementation for authenticating requests.
