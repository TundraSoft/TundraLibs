import {ConnectionOptions} from "./types.ts"
import { Events } from "../events/mod.ts";

export abstract class AbstractClient extends Events {
  protected _client: unknown;
  protected _connected: boolean = false;
  protected _serverVersion!: string;
  protected _queries = {
    total: {
      executed: 0, 
      error: 0, 
    }, 
    select: {
      executed: 0, 
      error: 0
    }, 
    insert: {
      executed: 0, 
      error: 0,
    }, 
    update: {
      executed: 0, 
      error: 0, 
    }, 
    delete: {
      executed: 0, 
      error: 0
    }, 
  }

  constructor(options: ConnectionOptions) {
    super();
    // Parse the options
  }

  async test(): Promise<boolean> {
    let retVal: boolean = true;
    if(await this.connect()) {
      try {
        await this.version();
      }
      catch {
        retVal = false;
      }
    }
    else {
      retVal = false;
    }
    return retVal;
  }

  async connect(): Promise<boolean> {
    try {
      if(this._connected === false) {
        await this._connect();
        this._connected = true;
      }
    }
    catch(e) {
      this._connected = false;
    }
    finally {
      return this._connected;
    }
  }

  async close(): Promise<boolean> {
    if(this._connected === true) {
      this._close();
      this._connected = false;
    }
    return this._connected;
  }

  async version(): Promise<string> {
    if(this._serverVersion !== undefined) {
      this.connect();
      this._serverVersion = await this._version();
    }
    return this._serverVersion;
  }

  async execute(sql: string, ...args: unknown[]) {
  }
  
  // abstract createTable(): void;
  // abstract dropTable(): void;
  // abstract createIndex(): void;
  // abstract migrate(): void;
  // abstract dropIndex(): void;

  // abstract select(): void;
  // abstract insert(): void;
  // abstract update(): void;
  // abstract delete(): void;
  
  // abstract begin(): void;
  // abstract commit(): void;
  // abstract rollback(): void;

  stats(name?: string) {
    
  }

  protected abstract _connect(): Promise<void>;

  protected abstract _close(): Promise<void>;

  protected abstract _version(): Promise<string>;

  protected abstract _execute(sql: string, ...args: unknown[]): Promise<void>;

}

// import { Options } from "../options/mod.ts";
// import { Events } from "../events/mod.ts";


// type TestEvents = {
//   event1(a: string): unknown;
// };

// export class EventOption<O> extends Events<TestEvents>{

// }