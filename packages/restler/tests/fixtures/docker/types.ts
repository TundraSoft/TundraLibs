/**
 * Types for Docker API responses
 */

/**
 * Docker container information
 */
export type DockerContainer = {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  State: string;
  Status: string;
  Ports: Array<{
    IP?: string;
    PrivatePort: number;
    PublicPort?: number;
    Type: string;
  }>;
  Labels: Record<string, string>;
  SizeRw?: number;
  SizeRootFs?: number;
  HostConfig: {
    NetworkMode: string;
  };
  NetworkSettings: {
    Networks: Record<string, {
      IPAddress: string;
      IPPrefixLen: number;
      Gateway: string;
      MacAddress: string;
    }>;
  };
  Mounts: Array<{
    Type: string;
    Name?: string;
    Source: string;
    Destination: string;
    Driver?: string;
    Mode: string;
    RW: boolean;
    Propagation: string;
  }>;
};

/**
 * Docker image information
 */
export type DockerImage = {
  Id: string;
  ParentId: string;
  RepoTags: string[];
  RepoDigests: string[];
  Created: number;
  Size: number;
  VirtualSize: number;
  SharedSize: number;
  Labels: Record<string, string>;
  Containers: number;
};

/**
 * Docker system information
 */
export type DockerInfo = {
  ID: string;
  Containers: number;
  ContainersRunning: number;
  ContainersPaused: number;
  ContainersStopped: number;
  Images: number;
  Driver: string;
  DriverStatus: [string, string][];
  Plugins: {
    Volume: string[];
    Network: string[];
    Authorization: string[];
    Log: string[];
  };
  MemoryLimit: boolean;
  SwapLimit: boolean;
  KernelMemory: boolean;
  CpuCfsPeriod: boolean;
  CpuCfsQuota: boolean;
  CPUShares: boolean;
  CPUSet: boolean;
  IPv4Forwarding: boolean;
  BridgeNfIptables: boolean;
  BridgeNfIp6tables: boolean;
  Debug: boolean;
  NFd: number;
  OomKillDisable: boolean;
  NGoroutines: number;
  SystemTime: string;
  LoggingDriver: string;
  CgroupDriver: string;
  NEventsListener: number;
  KernelVersion: string;
  OperatingSystem: string;
  OSType: string;
  Architecture: string;
  IndexServerAddress: string;
  RegistryConfig: {
    AllowNondistributableArtifactsCIDRs: string[];
    AllowNondistributableArtifactsHostnames: string[];
    InsecureRegistryCIDRs: string[];
    IndexConfigs: Record<string, {
      Name: string;
      Mirrors: string[];
      Secure: boolean;
      Official: boolean;
    }>;
    Mirrors: string[];
  };
  NCPU: number;
  MemTotal: number;
  DockerRootDir: string;
  HttpProxy: string;
  HttpsProxy: string;
  NoProxy: string;
  Name: string;
  Labels: string[];
  ExperimentalBuild: boolean;
  ServerVersion: string;
  ClusterStore: string;
  ClusterAdvertise: string;
  DefaultRuntime: string;
  LiveRestoreEnabled: boolean;
  Isolation: string;
  InitBinary: string;
  SecurityOptions: string[];
};
