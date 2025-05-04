import { type PrivateObject, privateObject } from '@tundralibs/utils';

type PermissionMap = Record<number, string>;
type ModulePermissions = Set<number>;
type GroupPermissions = Record<string, number>;
type Modules = Record<string, ModulePermissions>;
type Groups = Record<string, GroupPermissions>;
type ModuleMasks = Record<string, number>;
type ExportedPACTState = {
  permissions: PermissionMap;
  modules: Record<string, number[]>;
  groups: Record<string, Record<string, number>>;
  moduleMasks: Record<string, number>;
};

/*
Structure:
- Permissions: { [bitmask]: name }
- Modules: { [moduleName]: Set<number> }
- Groups: { [groupName]: { [moduleName]: number } }
- ModuleMasks: { [moduleName]: number }
*/

export class PACT {
  //#region GETTERS/SETTERS

  getPermissionName(perm: number): string | undefined {
    return this._permissions[perm];
  }

  getPermissionBit(name: string): number | undefined {
    name = name.trim().toUpperCase();
    for (const [bit, pname] of Object.entries(this._permissions)) {
      if (pname.toUpperCase() === name) return Number(bit);
    }
    return undefined;
  }

  listModules(): string[] {
    return Array.from(this._modules.keys());
  }

  listGroups(): string[] {
    return Array.from(this._groups.keys());
  }

  getModulePermissions(name: string): number[] {
    name = this.__normalize(name);
    if (!this._modules.has(name)) throw new Error(`Module ${name} not defined`);
    return Array.from(this._modules.get(name)!);
  }

  getModuleMask(module: string): number {
    module = this.__normalize(module);
    if (!this._modules.has(module)) {
      throw new Error(`Module ${module} not defined`);
    }
    return this._moduleMasks.get(module) ?? 0;
  }

  getGroupModulePermissions(group: string, module: string): number {
    group = this.__normalize(group);
    module = this.__normalize(module);
    if (!this._groups.has(group)) throw new Error(`Group ${group} not defined`);
    if (!this._modules.has(module)) {
      throw new Error(`Module ${module} not defined`);
    }
    const groupPerms = this._groups.get(group)!;
    return groupPerms[module] ?? 0;
  }

  //#endregion

  //#region CONSTRUCTOR

  constructor(permissions: PermissionMap = {}) {
    this._permissions = { ...permissions };
    // For thread safety, optionally initialize a lock (dummy for single-threaded JS)
    this.__lock = false;
  }

  //#endregion

  //#region PUBLIC

  exportState(): ExportedPACTState {
    // Deep copy for immutability
    const modules: Record<string, number[]> = {};
    for (const key of this._modules.keys()) {
      modules[key] = Array.from(this._modules.get(key)!);
    }
    const groups: Record<string, Record<string, number>> = {};
    for (const key of this._groups.keys()) {
      groups[key] = { ...this._groups.get(key)! };
    }
    const moduleMasks: Record<string, number> = {};
    for (const key of this._moduleMasks.keys()) {
      moduleMasks[key] = this._moduleMasks.get(key)!;
    }
    return {
      permissions: { ...this._permissions },
      modules,
      groups,
      moduleMasks,
    };
  }

  /**
   * Thread-safe and validated import of state.
   */
  importState(state: ExportedPACTState): this {
    this.__acquireLock();
    try {
      // Validate permissions
      for (const bit of Object.keys(state.permissions)) {
        const n = Number(bit);
        if (n <= 0 || (n & (n - 1)) !== 0) {
          throw new Error(`Invalid permission bit in import: ${bit}`);
        }
      }
      // Validate modules
      for (const [mod, perms] of Object.entries(state.modules)) {
        for (const perm of perms) {
          if (!(perm in state.permissions)) {
            throw new Error(
              `Module ${mod} references undefined permission ${perm}`,
            );
          }
        }
      }
      // Validate groups
      for (const [group, mods] of Object.entries(state.groups)) {
        for (const mod of Object.keys(mods)) {
          if (!(mod in state.modules)) {
            throw new Error(
              `Group ${group} references undefined module ${mod}`,
            );
          }
        }
      }
      // Validate moduleMasks
      for (const mod of Object.keys(state.moduleMasks)) {
        if (!(mod in state.modules)) {
          throw new Error(`Module mask references undefined module ${mod}`);
        }
      }
      // If all validations pass, import state
      this._permissions = { ...state.permissions };
      this._modules = privateObject();
      this._groups = privateObject();
      this._moduleMasks = privateObject();
      for (const key in state.modules) {
        this._modules.set(key, new Set(state.modules[key]));
      }
      for (const key in state.groups) {
        this._groups.set(key, { ...state.groups[key] });
      }
      for (const key in state.moduleMasks) {
        this._moduleMasks.set(key, state.moduleMasks[key]!);
      }
      return this;
    } finally {
      this.__releaseLock();
    }
  }

  // --- 7. Batch Operations ---

  /**
   * Batch add modules.
   */
  addModules(modules: Array<{ name: string; permissions: number[] }>): this {
    for (const { name, permissions } of modules) {
      this._addModule(name, permissions);
    }
    return this;
  }

  /**
   * Batch remove modules.
   */
  removeModules(names: string[]): this {
    for (const name of names) {
      this._removeModule(name);
    }
    return this;
  }

  /**
   * Batch create groups.
   */
  createGroups(names: string[]): this {
    for (const name of names) {
      this._createGroup(name);
    }
    return this;
  }

  /**
   * Batch remove groups.
   */
  removeGroups(names: string[]): this {
    for (const name of names) {
      this._removeGroup(name);
    }
    return this;
  }

  /**
   * Batch grant permissions.
   */
  grantPermissionsBatch(
    grants: Array<{ group: string; module: string; permissions: number[] }>,
  ): this {
    for (const { group, module, permissions } of grants) {
      this._grantPermissions(group, module, permissions);
    }
    return this;
  }

  /**
   * Batch revoke permissions.
   */
  revokePermissionsBatch(
    revokes: Array<{ group: string; module: string; permissions: number[] }>,
  ): this {
    for (const { group, module, permissions } of revokes) {
      this._revokePermissions(group, module, permissions);
    }
    return this;
  }

  // --- 8. Permission Listing ---

  /**
   * List all defined permissions as {bit: name}.
   */
  listAllPermissions(): { bit: number; name: string }[] {
    return Object.entries(this._permissions).map(([bit, name]) => ({
      bit: Number(bit),
      name,
    }));
  }

  /**
   * List granted permissions for a group/module as bits.
   */
  listGrantedPermissionsBits(module: string, group?: string): number[] {
    if (group) {
      const mask = this.getGroupModulePermissions(group, module);
      return this._bitsFromMask(mask);
    } else {
      const mask = this.getModuleMask(module);
      return this._bitsFromMask(mask);
    }
  }

  /**
   * List granted permissions for a group/module as names.
   */
  listGrantedPermissionsNames(module: string, group?: string): string[] {
    return this.listGrantedPermissionsBits(module, group)
      .map((bit) => this.getPermissionName(bit))
      .filter((name): name is string => !!name);
  }

  // --- 9. TypeScript Generics ---

  /**
   * Type-safe check for module existence using generics.
   */
  hasModule<T extends string>(name: T): boolean {
    return this._modules.has(this.__normalize(name));
  }

  /**
   * Type-safe check for group existence using generics.
   */
  hasGroup<T extends string>(name: T): boolean {
    return this._groups.has(this.__normalize(name));
  }

  //#endregion

  //#region PROTECTED

  protected _addModule(name: string, permissions: Array<number>): this {
    name = this.__normalize(name);
    if (this._modules.has(name)) {
      throw new Error(`Module ${name} already defined`);
    }
    const perms = new Set<number>();
    for (const perm of permissions) {
      this.__validatePermission(perm);
      perms.add(perm);
    }
    this._modules.set(name, perms);
    return this;
  }

  protected _removeModule(name: string): this {
    name = this.__normalize(name);
    if (!this._modules.has(name)) throw new Error(`Module ${name} not defined`);
    this._modules.delete(name);
    for (const group of this._groups.keys()) {
      const groupPerms = this._groups.get(group);
      if (groupPerms?.[name]) delete groupPerms[name];
    }
    this._moduleMasks.delete(name);
    return this;
  }

  protected _createGroup(name: string): this {
    name = this.__normalize(name);
    if (this._groups.has(name)) {
      throw new Error(`Group ${name} already defined`);
    }
    this._groups.set(name, {});
    return this;
  }

  protected _removeGroup(name: string): this {
    name = this.__normalize(name);
    if (!this._groups.has(name)) throw new Error(`Group ${name} not defined`);
    this._groups.delete(name);
    return this;
  }

  protected _grantPermissions(
    group: string,
    module: string,
    permissions: Array<number>,
  ): this {
    group = this.__normalize(group);
    module = this.__normalize(module);
    if (!this._groups.has(group)) this._createGroup(group);
    if (!this._modules.has(module)) {
      throw new Error(`Module ${module} not defined`);
    }
    const allowed = this._modules.get(module)!;
    let mask = 0;
    for (const perm of permissions) {
      this.__validatePermission(perm);
      if (!allowed.has(perm)) {
        throw new Error(`Permission ${perm} not allowed for module ${module}`);
      }
      mask |= perm;
    }
    const groupPerms = this._groups.get(group)!;
    groupPerms[module] = (groupPerms[module] ?? 0) | mask;
    this._groups.set(group, { ...groupPerms }); // immutability
    return this;
  }

  protected _revokePermissions(
    group: string,
    module: string,
    permissions: Array<number>,
  ): this {
    group = this.__normalize(group);
    module = this.__normalize(module);
    if (!this._groups.has(group)) throw new Error(`Group ${group} not defined`);
    if (!this._modules.has(module)) {
      throw new Error(`Module ${module} not defined`);
    }
    const groupPerms = { ...this._groups.get(group)! };
    if (!groupPerms[module]) return this;
    for (const perm of permissions) {
      this.__validatePermission(perm);
      groupPerms[module]! &= ~perm;
    }
    this._groups.set(group, groupPerms);
    return this;
  }

  protected _setModuleMask(module: string, permissions: Array<number>): this {
    module = this.__normalize(module);
    if (!this._modules.has(module)) {
      throw new Error(`Module ${module} not defined`);
    }
    const allowed = this._modules.get(module)!;
    let mask = 0;
    for (const perm of permissions) {
      this.__validatePermission(perm);
      if (!allowed.has(perm)) {
        throw new Error(`Permission ${perm} not allowed for module ${module}`);
      }
      mask |= perm;
    }
    this._moduleMasks.set(module, mask);
    return this;
  }

  protected _hasPermission(
    permission: number,
    module: string,
    group?: string,
  ): boolean {
    module = this.__normalize(module);
    this.__validatePermission(permission);
    if (!this._modules.has(module)) {
      throw new Error(`Module ${module} not defined`);
    }
    if (group) {
      group = this.__normalize(group);
      if (!this._groups.has(group)) {
        throw new Error(`Group ${group} not defined`);
      }
      const groupPerms = this._groups.get(group)!;
      return !!(groupPerms[module] && (groupPerms[module]! & permission));
    } else {
      const mask = this._moduleMasks.get(module) ?? 0;
      return !!(mask & permission);
    }
  }

  //#endregion

  //#region PRIVATE

  private _permissions: PermissionMap;
  private _modules: PrivateObject<Modules> = privateObject();
  private _groups: PrivateObject<Groups> = privateObject();
  private _moduleMasks: PrivateObject<ModuleMasks> = privateObject();

  // --- Thread safety (dummy lock for demonstration, JS is single-threaded) ---
  private __lock: boolean;

  private __acquireLock(): void {
    if (this.__lock) throw new Error('PACT is locked for update');
    this.__lock = true;
  }

  private __releaseLock(): void {
    this.__lock = false;
  }

  private __validatePermission(perm: number): void {
    if (!(perm in this._permissions)) {
      throw new Error(`Permission ${perm} is not defined in permission map.`);
    }
    if (perm <= 0 || (perm & (perm - 1)) !== 0) {
      throw new Error(`Invalid permission ${perm}. Must be a power of 2.`);
    }
  }

  private __normalize(str: string): string {
    return str.trim().toLowerCase();
  }

  /**
   * Helper: get all bits set in a mask.
   */
  private _bitsFromMask(mask: number): number[] {
    const bits: number[] = [];
    for (const bit of Object.keys(this._permissions)) {
      const n = Number(bit);
      if ((mask & n) === n) bits.push(n);
    }
    return bits;
  }

  //#endregion
}
