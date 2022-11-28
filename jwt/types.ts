export type JWTAlgo = 'HS256' | 'HS384' | 'HS512';

export type JWTOptions = {
  algo: JWTAlgo;
  issuer?: string;
  key: string;
};

export type JWTHeaders = {
  typ: 'JWT';
  alg: JWTAlgo;
};

export type JWTClaims = {
  sub?: string;
  aud?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
};
