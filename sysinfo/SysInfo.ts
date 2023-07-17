import { HumanSizes, MemoryInfo, OSNames } from './types/mod.ts';

export class SysInfo {
  /**
   * Get the operating system vendor. Example apple, microsoft etc
   *
   * @returns {string} The OS Vendor
   * @static
   */
  static getVendor(): string {
    return Deno.build.vendor;
  }

  /**
   * getArch
   * Gets the system architecture
   *
   * @returns {string} the underlying architecture example x86_64 etc
   * @static
   */
  static getArch(): string {
    return Deno.build.arch;
  }

  /**
   * Gets the operating system name
   *
   * @returns string Returns the operating system name
   * @static
   */
  static getOs(): OSNames {
    return Deno.build.os;
  }

  /**
   * Returns the memory information.
   * *NOTE* This requires permission sys.memory (--allow-sys=getMemoryInfo). If this
   * permission is not set, it will return the data as 0
   *
   * @param {HumanSize} size Human understandable sizes.
   * @returns {Promise<MemoryInfo>}
   * @static
   */
  static async getMemoryInfo(
    size: HumanSizes = 'B',
  ): Promise<MemoryInfo> {
    const mem: MemoryInfo = {
      total: 0,
      free: 0,
      available: 0,
      swap: {
        total: 0,
        free: 0,
      },
    };
    const sizeMap = {
      'TB': 1024 * 1024 * 1024,
      'GB': 1024 * 1024,
      'MB': 1024,
      'KB': 1,
      'B': 1 / 1024,
    };

    const sizeCalc = sizeMap[size] || 1;

    try {
      const checkEnv = await Deno.permissions.query({
        name: 'sys',
        kind: 'systemMemoryInfo',
      });
      if (checkEnv.state === 'granted') {
        const memInfo = Deno.systemMemoryInfo();
        mem.available = Math.round(memInfo.available / sizeCalc);
        mem.free = Math.round(memInfo.free / sizeCalc);
        mem.total = Math.round(memInfo.total / sizeCalc);
        mem.swap.total = Math.round(memInfo.swapTotal / sizeCalc);
        mem.swap.free = Math.round(memInfo.swapFree / sizeCalc);
      }
    } catch (_e) {
      // Supress error
      // console.log(_e);
    }
    return mem;
  }

  /**
   * Returns the load average for the past 1, 5 and 15 minutes.
   * *NOTE* This requires permission sys.loadavg (--allow-sys=loadavg). If
   * this is not set, it returns empty array
   *
   * @returns {Promise<Array<number>>} return 1, 5 and 15 minute load average
   * @static
   */
  static async getLoadAverage(): Promise<Array<number> | undefined> {
    try {
      const checkEnv = await Deno.permissions.query({
        name: 'sys',
        kind: 'loadavg',
      });
      if (checkEnv.state === 'granted') {
        return await Deno.loadavg();
      }
    } catch (_e) {
      // supress error
      // console.log(_e);
    }
    return [];
  }

  /**
   * Return the current process id of the runtime
   *
   * @returns {number} The process id
   * @static
   */
  static getPid(): number {
    return Deno.pid;
  }

  /**
   * Gets the hostname of the operating system
   *
   * @returns {string} The hostname or blank if execution rights are not present
   * @static
   */
  static async getHostname(): Promise<string | undefined> {
    try {
      const checkEnv = await Deno.permissions.query({
        name: 'sys',
        kind: 'hostname',
      });
      if (checkEnv.state === 'granted') {
        return Deno.hostname();
      }
    } catch (_e) {
      // supress error
      // console.log(_e);
    }
    return undefined;
  }

  /**
   * Returns the IP address assigned to the system.
   *
   * @param {boolean} onlyPublic get only public ip address
   * @returns {Promise<string | undefined>} The IP address assigned to the system
   * @static
   */
  static async getIP(onlyPublic = false): Promise<string[]> {
    try {
      const checkEnv = await Deno.permissions.query({
        name: 'sys',
        kind: 'networkInterfaces',
      });
      if (checkEnv.state === 'granted') {
        const networks = Deno.networkInterfaces();
        const ipAddress = Object.values(networks)
          .flat()
          .filter((network) => {
            if (onlyPublic === true && network.family === 'IPv4') {
              const regex =
                /(^192\.168\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)|(^172\.([1][6-9]|[2][0-9]|[3][0-1])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)|(^10\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])\.([0-9]|[0-9][0-9]|[0-2][0-5][0-5])$)/;
              return regex.test(network.address);
            } else if (onlyPublic === true && network.family === 'IPv6') {
              const regex = /(^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$)/;
              return regex.test(network.address);
            }
            return true;
          })
          .map((network) => network.address);
        return ipAddress;
      }
    } catch (_e) {
      // supress error
      // console.log(_e);
    }
    return [];
  }

  // static async _init() {
  //   const checkEnv = await Deno.permissions.query({ name: 'env' });
  //   __permissions.env = (checkEnv.state === 'granted');
  //   const checkReadEnv = await Deno.permissions.query({ name: 'read', path: './.env' });
  //   __permissions.readEnv = (checkReadEnv.state === 'granted');
  //   const checkMemory = await Deno.permissions.query({
  //     name: 'sys',
  //     kind: 'systemMemoryInfo',
  //   });
  //   __permissions.memory = (checkMemory.state === 'granted');
  //   const checkLoad = await Deno.permissions.query({
  //     name: 'sys',
  //     kind: 'loadavg',
  //   });
  //   __permissions.load = (checkLoad.state === 'granted');
  //   const checkHostname = await Deno.permissions.query({
  //     name: 'sys',
  //     kind: 'hostname',
  //   });
  //   __permissions.hostname = (checkHostname.state === 'granted');
  //   const checkNetwork = await Deno.permissions.query({
  //     name: 'sys',
  //     kind: 'networkInterfaces',
  //   });
  //   __permissions.network = (checkNetwork.state === 'granted');
  // }
}

// await SysInfo._init();
