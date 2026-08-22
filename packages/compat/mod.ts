/**
 * @fileoverview Main entry point for the compat package.
 *
 * Re-exports all public APIs from the compat package modules including:
 * - WebServer (HTTP/HTTPS server)
 * - File system operations
 * - Networking (TCP listeners and connections)
 * - Path utilities
 * - Runtime detection
 * - Permissions
 * - Fetch with TLS support
 *
 * The test helpers are deliberately NOT re-exported here: `test.ts`
 * imports `bun:test` and `node:test`, which esbuild and wrangler cannot
 * resolve, so a barrel that pulls them in fails every Cloudflare Workers
 * build. Import them from `@tundralibs/compat/test` instead.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { WebServer, readFile, RUNTIME, listen, connect } from '@tundralibs/compat';
 * ```
 */

export {
  type RequestInfo,
  ServerAlreadyRunningError,
  ServerConfigurationError,
  ServerError,
  type ServerEvents,
  type ServerHandler,
  type ServerMetrics,
  type ServerMode,
  ServerNotRunningError,
  type ServerOptions,
  ServerPermissionError,
  type ServerState,
  type ServerWebSocket,
  type UpgradeDecision,
  WebServer,
  type WebSocketData,
  type WebSocketHandler,
  type WebSocketReadyState,
  type WebSocketUpgradeContext,
} from './webserver/mod.ts';

export {
  CompatError,
  CompatTypeError,
  ConnectionTimeoutError,
  UnsupportedRuntimeError,
} from './Error.ts';
export { fetch } from './fetch.ts';
export { type HTTPMethod, STATUS_TEXT, type StatusCode } from './http.ts';
export {
  combineSignals,
  FetchFileNotFoundError,
  FetchInvalidPEMError,
  FetchPathTraversalError,
  FetchTLSError,
  type FileTLS,
  type InlineTLS,
  type TLSOptions,
  type ValidatedTLS,
  validateTLS,
  validateTLSContent,
  validateTLSFiles,
} from './common.ts';
export {
  type AsyncFileHandle,
  copyDir,
  copyDirSync,
  copyFile,
  copyFileSync,
  deleteFile,
  deleteFileSync,
  type DirectoryEntry,
  emptyDir,
  emptyDirSync,
  ensureDir,
  ensureDirSync,
  ensureFile,
  ensureFileSync,
  FileAccessDenied,
  FileAlreadyExists,
  type FileInfo,
  FileInvalidPath,
  FileNotFound,
  FileOperationError,
  FileTypeMismatch,
  isDir,
  isDirectory,
  isDirectorySync,
  isDirSync,
  isFile,
  isFileSync,
  makeDir,
  makeDirSync,
  makeTempDir,
  makeTempDirSync,
  makeTempFile,
  makeTempFileSync,
  move,
  moveDir,
  moveDirSync,
  moveFile,
  moveFileSync,
  moveSync,
  openFile,
  openFileSync,
  type OpenOptions,
  pathExists,
  pathExistsSync,
  readDir,
  type ReadDirOptions,
  readDirSync,
  readFile,
  readFileStream,
  readFileSync,
  readJSONFile,
  readJSONFileSync,
  readTextFile,
  readTextFileSync,
  realPath,
  realPathSync,
  remove,
  removeDir,
  removeDirSync,
  removeSync,
  renameDir,
  renameDirSync,
  renameFile,
  renameFileSync,
  stat,
  statSync,
  type SyncFileHandle,
  type TempOptions,
  writeFile,
  writeFileSync,
  writeJSONFile,
  writeJSONFileSync,
  type WriteOptions,
  writeTextFile,
  writeTextFileSync,
} from './file.ts';
export {
  basename,
  DELIMITER,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  SEPARATOR,
  SEPARATOR_PATTERN,
} from './path.ts';
export {
  getPermissions,
  getPermissionsSync,
  hasPermission,
  hasPermissionSync,
  type PermissionName,
  type PermissionObject,
  type PermissionResponse,
} from './permissions.ts';
export {
  ARCH,
  type Architecture,
  cpus,
  cwd,
  exit,
  freemem,
  getArch,
  getEnv,
  getOS,
  getProcessId,
  getRuntime,
  isBun,
  isDeno,
  isNode,
  type MemoryUsage,
  memoryUsage,
  onError,
  onExit,
  onSignal,
  onUnhandledRejection,
  type OperatingSystem,
  OS,
  PID,
  RUNTIME,
  type Runtime,
  type Signal,
  totalmem,
  unrefTimer,
  uptime,
} from './runtime.ts';
export {
  args,
  argv,
  type ArgValue,
  choose,
  type ChooseOptions,
  consoleSize,
  isTTY,
  type ParsedArgs,
  ProgressBar,
  type ProgressBarOptions,
  prompt,
  type PromptOptions,
  Spinner,
  SPINNER_FRAMES_ASCII,
  SPINNER_FRAMES_BRAILLE,
  type SpinnerOptions,
  type WritableLike,
} from './cli/mod.ts';
export {
  connect,
  type Connection,
  type ConnectOptions,
  hostname,
  listen,
  type Listener,
  type ListenOptions,
  upgradeTls,
  type UpgradeTlsOptions,
} from './net.ts';
export { type UdpSocket, udpSocket, type UdpSocketOptions } from './udp.ts';
export {
  type FsEvent,
  type FsEventKind,
  watch,
  type Watcher,
  type WatchOptions,
} from './watch.ts';
export {
  BinaryCodec,
  type Codec,
  JsonCodec,
  type MessageContext,
  type Middleware,
  StringCodec,
  type WebSocketListenOptions,
  WebSocketServer,
  type WebSocketServerOptions,
} from './websocket/mod.ts';
