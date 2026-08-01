import { describe, it } from './test.ts';
import * as asserts from '@std/asserts';
import { udpSocket } from './udp.ts';
import { isDeno } from './runtime.ts';

describe('compat.udp', () => {
  describe('udpSocket', () => {
    it('opens a sender on an ephemeral port', async () => {
      const sock = await udpSocket();
      asserts.assertExists(sock);
      asserts.assertEquals(typeof sock.send, 'function');
      asserts.assertEquals(typeof sock.close, 'function');
      sock.close();
    });

    it('close() is idempotent', async () => {
      const sock = await udpSocket();
      sock.close();
      // Second call must not throw.
      sock.close();
    });

    // Live send/receive round-trip is Deno-only here — Bun + Node use
    // their own native UDP APIs (already covered by other test suites
    // in their respective runtimes). The Deno path exercises the
    // common shape: bind a receiver, fire from the sender, assert
    // the receiver got the bytes.
    if (isDeno) {
      it('delivers a datagram to a bound receiver', async () => {
        const receiver = Deno.listenDatagram({
          transport: 'udp',
          hostname: '127.0.0.1',
          port: 0,
        });
        const localAddr = receiver.addr as Deno.NetAddr;

        try {
          const sock = await udpSocket();
          const payload = 'hello-udp';
          const sent = await sock.send(payload, '127.0.0.1', localAddr.port);
          asserts.assertEquals(sent, payload.length);

          const [bytes, _from] = await receiver.receive();
          asserts.assertEquals(new TextDecoder().decode(bytes), payload);

          sock.close();
        } finally {
          receiver.close();
        }
      });

      it('Uint8Array payloads pass through unchanged', async () => {
        const receiver = Deno.listenDatagram({
          transport: 'udp',
          hostname: '127.0.0.1',
          port: 0,
        });
        const localAddr = receiver.addr as Deno.NetAddr;

        try {
          const sock = await udpSocket();
          const payload = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
          await sock.send(payload, '127.0.0.1', localAddr.port);

          const [bytes] = await receiver.receive();
          asserts.assertEquals(Array.from(bytes), Array.from(payload));

          sock.close();
        } finally {
          receiver.close();
        }
      });
    }
  });
});
