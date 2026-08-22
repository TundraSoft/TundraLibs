/**
 * @fileoverview The 1.0 cluster seams — `app.instanceId` (a stable ULID)
 * and the nullable `app.cluster` slot the future cluster module feeds and
 * the dev console reads. No coordination here yet; just the seams.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { Application } from './Application.ts';
import type { RapidClusterSnapshot } from './types/mod.ts';

const make = (name: string) =>
  Application.initialize({
    name,
    server: { port: 0, hostname: '127.0.0.1' },
    logger: { handlers: [] },
    uploads: { path: '/tmp/rapid-cluster-test' },
  });

describe('rapid.Application cluster seams', () => {
  it('instanceId is a stable, non-empty id, distinct per app, unlike the per-request id', async () => {
    const a = await make('inst-a');
    const b = await make('inst-b');
    asserts.assert(a.instanceId.length > 0);
    asserts.assertStrictEquals(a.instanceId, a.instanceId); // stable
    asserts.assertNotEquals(a.instanceId, b.instanceId);
    asserts.assertNotEquals(a.instanceId, a.newRequestId()); // not the request id
  });

  it('cluster is undefined until fed, then returns the snapshot, then clears', async () => {
    const app = await make('cluster-slot');
    asserts.assertEquals(app.cluster, undefined);
    const snap: RapidClusterSnapshot = {
      seq: 1,
      at: '2026-08-22T00:00:00.000Z',
      leader: app.instanceId,
      members: [{
        id: app.instanceId,
        host: 'pod-1',
        startedAt: '2026-08-22T00:00:00.000Z',
        role: 'leader',
        lastSeen: '2026-08-22T00:00:01.000Z',
      }],
    };
    app.setCluster(snap);
    asserts.assertStrictEquals(app.cluster, snap);
    app.setCluster(undefined);
    asserts.assertEquals(app.cluster, undefined);
  });
});
