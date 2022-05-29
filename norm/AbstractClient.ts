
export abstract class AbstractClient {
  protected _connection: unknown;
  protected _connectionStatus!: boolean;
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
  constructor() {}

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
      await this._connect();
      return true;
    }
    catch(e) {
      
      return false;
    }
  }

  async close(): Promise<boolean> {
    if(this._connectionStatus === true) {
      try {
        await this._close();
        this._connectionStatus = false;
        return true;
      }
      catch(e) {

        return false;
      }
    }
    return true;
  }

  async version(): Promise<string> {
    return '';
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

  stats() {}

  protected abstract _connect(): Promise<boolean>;

  protected abstract _close(): Promise<boolean>;

  protected abstract _version(): Promise<string>;

  protected abstract _execute(sql: string, ...args: unknown[]): Promise<void>;

}

import { Options } from "../options/mod.ts";
import { Events } from "../events/mod.ts";
