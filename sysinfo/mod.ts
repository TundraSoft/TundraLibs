export default {
  __env!: undefined, 
  /**
   * getVendor
   * Get the operating system vendor. Example apple, microsoft etc
   * 
   * @returns string The OS Vendor
   */
  getVendor: function() {
    return Deno.build.vendor;
  }, 
  /**
   * getArch
   * Gets the system architecture
   * 
   * @returns string the underlying architecture example x86_64 etc
   */
  getArch: function() {
    return Deno.build.arch;
  }, 
  /**
   * getOs
   * Gets the operating system name
   * 
   * @returns string Returns the operating system name
   */
  getOs: function(): "windows" | "darwin" | "linux" {
    return Deno.build.os
  }, 
  /**
   * getMemory
   * Gets the memory information (available, free, total, swap)
   */
  getMemory: async function() {
    try {
      const checkEnv = await Deno.permissions.query({name: 'env'});
      if(checkEnv.state === "granted") {
        console.log(Deno.systemMemoryInfo())
      }
    }
    catch(e) {

    }
    console.log(Deno.systemMemoryInfo())
  }, 

  getLoad: async function() {
    try {
      const checkEnv = await Deno.permissions.query({name: 'env'});
      if(checkEnv.state === "granted") {
        console.log(Deno.systemMemoryInfo())
      }
    }
    catch(e) {

    }
    console.log(Deno.loadavg())
  }, 
  /**
   * getHostname
   * Gets the hostname of the operating system
   * 
   * @returns string The hostname or blank if execution rights are not present
   */
  getHostname: async function() {
    const isWin = (Deno.build.os === 'windows'), 
      checkRun = await Deno.permissions.query({name: 'run'});
    let hostName!: string;
    if(checkRun.state === "granted") {
      try {
        let host = await Deno.run({
          cmd: ['hostname'], 
          stdout: 'piped'
        });
        const { success } = await host.status();
        if(success) {
          const raw = await host.output();
          hostName = new TextDecoder().decode(raw).trim();
        }
      }
      catch {

      }
    }
    return hostName;
  }, 
  /**
   * getIP
   * Returns the IP address assigned to the system. 
   * 
   * @returns string The IP address assigned to the system
   */
  getIP: async function() {
    const isWin = (Deno.build.os === 'windows'), 
      command = isWin ? 'ipconfig' : 'ifconfig', 
      checkRun = await Deno.permissions.query({name: 'run'});
    let ip!: string;
    if(checkRun.state === "granted") {
      try {
        let ifconfig = await Deno.run({
          cmd: [command],
          stdout: 'piped',
        });
        const { success } = await ifconfig.status();
        if (success) {
          const raw = await ifconfig.output();
          const text = new TextDecoder().decode(raw);
          if (isWin) {
            const addrs = text.match(new RegExp('ipv4.+([0-9]+.){3}[0-9]+', 'gi'));
            let temp = addrs
              ? addrs[0].match(new RegExp('([0-9]+.){3}[0-9]+', 'g'))
              : undefined;
            const addr = temp ? temp[0] : undefined;
            await Deno.close(ifconfig.rid);
            if (!addr) {
              throw new Error('Could not resolve your local adress.');
            }
            return addr;
          } else {
            const addrs = text.match(
              new RegExp('inet (addr:)?([0-9]*.){3}[0-9]*', 'g')
            );
            await Deno.close(ifconfig.rid);
            if (!addrs || !addrs.some((x) => !x.startsWith('inet 127'))) {
              throw new Error('Could not resolve your local adress.');
            }
            return (
              addrs &&
              addrs
                .find((addr: string) => !addr.startsWith('inet 127'))
                ?.split('inet ')[1]
            );
          }
        }
      } catch (err) {
        console.log(err.message);
      }
    }
    return ip;
  }, 

  getEnv: async function(name?: string) {
    // if(this.__env.size === 0) {
    //   try {
    //     const checkEnv = await Deno.permissions.query({name: 'env'});
    //     if(checkEnv.state === "granted") {
    //       this.__env = new Map(Object.entries(Deno.env.toObject()));
    //     }
    //   }
    //   catch(e) {
  
    //   }
    // }
  }
}
