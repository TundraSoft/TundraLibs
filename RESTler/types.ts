import { METHODS } from "../HTTP/mod.ts";

export type APIKeyAuth = {
  APIKey: string;
  KeyHeader: string;
};

export type DigestAuth = {
  APISecret: string;
  APIKey: string;
  HMACType: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
  KeyHeader: string;
  HashHeader: string;
};

export type HeaderFunction = () => Record<string, string>;

export type RESTlerConfig = {
  baseURI: string;
  auth?: APIKeyAuth | DigestAuth;
  customHeaders?: Record<string, string> | HeaderFunction;
  timeout: number;
  referrer?: string;
};

export type RESTOptions = {
  headers?: Headers;
  searchParams?: URLSearchParams;
  method: METHODS;
  body?: FormData;
  timeout: number;
};
