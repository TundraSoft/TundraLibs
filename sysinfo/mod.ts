import { path } from '../dependencies.ts';

const __envData: Map<string, string> = new Map();

export type MemoryInfo = {
  total: number;
  free: number;
  available: number;
  swap: {
    total: number;
    free: number;
  };
};

export type HumanSizes = 'B' | 'KB' | 'MB' | 'GB' | 'TB';

export const Sysinfo = {
  /**
   * getVendor
   * Get the operating system vendor. Example apple, microsoft etc
   *
   * @returns string The OS Vendor
   */
  getVendor: function (): string {
    return Deno.build.vendor;
  },

  /**
   * getArch
   * Gets the system architecture
   *
   * @returns string the underlying architecture example x86_64 etc
   */
  getArch: function (): string {
    return Deno.build.arch;
  },

  /**
   * getOs
   * Gets the operating system name
   *
   * @returns string Returns the operating system name
   */
  getOs: function ():
    | 'windows'
    | 'darwin'
    | 'linux'
    | 'freebsd'
    | 'netbsd'
    | 'aix'
    | 'solaris'
    | 'illumos' {
    return Deno.build.os;
  },

  /**
   * getMemory
   *
   * Returns the memory information. this requires unstable `--unstable` flag to be set
   * If it is not set, it will return undefined.
   *
   * @param size HumanSize Human understandable sizes.
   * @returns Promise<MemoryInfo>
   */
  getMemory: async function (size: HumanSizes = 'B') {
    const mem: MemoryInfo = {
      total: 0,
      free: 0,
      available: 0,
      swap: {
        total: 0,
        free: 0,
      },
    };
    let sizeCalc = 1;
    switch (size) {
      case 'TB':
        sizeCalc = 1024 * 1024 * 1024;
        break;
      case 'GB':
        sizeCalc = 1024 * 1024;
        break;
      case 'MB':
        sizeCalc = 1024;
        break;
      case 'KB':
        sizeCalc = 1;
        break;
      default:
      case 'B':
        sizeCalc = 1 / 1024;
        break;
    }
    try {
      const checkEnv = await Deno.permissions.query({
        name: 'sys',
        kind: 'systemMemoryInfo',
      });
      if (checkEnv.state === 'granted') {
        const memInfo = Deno.systemMemoryInfo();
        mem.available = memInfo.available / sizeCalc;
        mem.free = memInfo.free / sizeCalc;
        mem.total = memInfo.total / sizeCalc;
        mem.swap.total = memInfo.swapTotal / sizeCalc;
        mem.swap.free = memInfo.swapFree / sizeCalc;
      }
    } catch (e) {
      // Supress error
      console.log(e);
    }
    return (mem.total === 0) ? undefined : mem;
  },

  /**
   * getLoad
   *
   * Returns the load average for the past 1, 5 and 15 minutes. This requires the unstable (`--unstable`)
   * flag to be enabled. If not set, will return undefined
   *
   * @returns Promise<Array<number> | undefined> return 1, 5 and 15 minute load average
   */
  getLoad: async function (): Promise<Array<number> | undefined> {
    try {
      const checkEnv = await Deno.permissions.query({
        name: 'sys',
        kind: 'loadavg',
      });
      if (checkEnv.state === 'granted') {
        return await Deno.loadavg();
      }
    } catch (e) {
      // supress error
      console.log(e);
    }
    return undefined;
  },

  /**
   * getPid
   *
   * Return the current process id of the runtime
   *
   * @returns number The process id
   */
  getPid: function (): number {
    return Deno.pid;
  },

  /**
   * getHostname
   * Gets the hostname of the operating system
   *
   * @returns string The hostname or blank if execution rights are not present
   */
  getHostname: function () {
    return Deno.hostname();
  },

  /**
   * getIP
   * Returns the IP address assigned to the system.
   *
   * @param onlyPublic {boolean} get only public ip address
   * @returns Promise<string | undefined> The IP address assigned to the system
   */
  getIP: function (onlyPublic = false): string[] {
    const networks = Deno.networkInterfaces();
    const ipAddress = Object.values(networks)
      .flat()
      .filter((network) => {
        if (onlyPublic === true && network.family === 'IPv4') {
          const regex =
            /(^192\.168\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)|(^172\.([1][6-9]|[2][0-9]|[3][0-1])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)|(^10\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)/;
          return regex.test(network.address);
        }
        return true;
      })
      .map((network) => network.address);
    return ipAddress;
  },

  /**
   * _loadEnv
   *
   * Loads the environment variables. This requires permission --allow-env to be set
   *
   * @protected
   */
  _loadEnv: async function (location = './') {
    if (__envData.size === 0) {
      // First load from .env file if found
      const file = path.join(location, '.env');
      const checkRun = await Deno.permissions.query({
        name: 'read',
        path: file,
      });
      if (checkRun.state === 'granted') {
        try {
          const data = new TextDecoder().decode(await Deno.readFile(file)),
            lines = data.split('\n'),
            pattern = new RegExp(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/),
            isQuoted = new RegExp(/^('|")[^\1].*(\1)$/);
          lines.forEach((line) => {
            if (pattern.test(line)) {
              const record = line.match(pattern),
                [_, key, value] = record as string[];
              __envData.set(
                key,
                (((isQuoted.test(value)) ? value.slice(1, -1) : value) || '')
                  .trim(),
              );
            }
          });
        } catch {
          // Suppress error
        }
      }
      try {
        const checkEnv = await Deno.permissions.query({ name: 'env' });
        if (checkEnv.state === 'granted') {
          for (const [key, value] of Object.entries(Deno.env.toObject())) {
            __envData.set(key, value);
          }
        }
      } catch {
        // Supress error
      }
    }
  },

  /**
   * getEnv
   *
   * Returns an Environment variable (if set). This requires permission --allow-env
   *
   * @param name string The ENV parameter to get
   * @returns string | undefined Value if found, else undefined
   */
  getEnv: async function (name: string): Promise<string | undefined> {
    await this._loadEnv();
    if (__envData.has(name)) {
      return __envData.get(name);
    }
    return undefined;
  },

  getAllEnv: async function (): Promise<Map<string, string>> {
    await this._loadEnv();
    return __envData;
  },

  /**
   * hasEnv
   *
   * Check if an ENV parameter exists. This will load the env data and then check.
   * It will require --allow-env to have been set
   *
   * @param name string The ENV parameter name to check
   * @returns boolean True if exists, else false
   */
  hasEnv: async function (name: string): Promise<boolean> {
    await this._loadEnv();
    return __envData.has(name);
  },
};

console.log(Sysinfo.getIP());
