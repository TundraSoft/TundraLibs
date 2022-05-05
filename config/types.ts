export type ConfigMode = "DEV" | "PROD";

export type ConfigType = "JSON" | "YAML" | "TOML";

export type ConfigFile = {
  basePath: string;
  fileName: string;
  configMode: ConfigMode;
  type: ConfigType;
  extention: string;
};
