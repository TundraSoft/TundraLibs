export type EngineCapabilities = {
  /** Does the engine support transactions **/
  transactions: boolean;
  /** Does the engine support Pooled connections **/
  pooledConnections: boolean;
  /** Does the engine support prepared statements **/
  preparedStatements: boolean;
  /** The parameter format used by engine **/
  parameterReplacement?: {
    prefix: string;
    suffix: string;
  };
};
