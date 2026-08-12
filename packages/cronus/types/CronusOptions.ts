/**
 * @fileoverview {@link CronusOptions} — scheduler configuration.
 *
 * @module
 */

export type CronusOptions = {
  /**
   * `unref` the internal timer so a running scheduler does NOT keep the
   * process alive on its own. Leave `false` for a standalone cron
   * daemon (the ticker holds the loop); set `true` when embedding
   * inside a host that owns the lifecycle (e.g. an HTTP server) so
   * shutdown is not blocked by a pending tick. Caveat: with nothing
   * else holding the loop, the process can exit MID-RUN of an async
   * job — the host, not cronus, is responsible for draining work
   * before exit.
   * @default false
   */
  unref?: boolean;
};
