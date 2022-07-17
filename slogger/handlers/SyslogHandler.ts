import { BaseHandler } from "../BaseHandler.ts";
import { Syslog } from "../../syslog/mod.ts";
import type { SyslogOptions } from "../types.ts";

/**
 * SyslogHandler
 *
 * Sends log data to a remote Syslog server. Currently supports only UDP. TCP support is not planned..
 */
export class SyslogHandler extends BaseHandler<SyslogOptions> {
  protected _peer!: Deno.NetAddr;
  protected _socket!: Deno.DatagramConn;

  constructor(option: Partial<SyslogOptions>) {
    super(option);
    // addEventListener("unload", async () => await this.cleanup());
  }

  protected async _handleLog(log: Syslog): Promise<void> {
    if (this._options.structureData) {
      // log.setStructuredData(this._options.structureData);
    }
    await this._socket.send(
      new TextEncoder().encode(this._format(log)),
      this._peer,
    );
  }

  async init(): Promise<void> {
    this._socket = await Deno.listenDatagram({
      port: 0,
      transport: "udp",
      hostname: "0.0.0.0",
    });
    this._peer = {
      transport: this._options.serverType,
      hostname: this._options.serverHost,
      port: this._options.serverPort,
    };
  }

  async cleanup(): Promise<void> {
    await this._socket.close();
  }
}
