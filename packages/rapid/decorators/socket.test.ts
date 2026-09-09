/**
 * @fileoverview SOCKET decorator — recording and the shared-method
 * multi-transport contract.
 * @module
 */
import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import type { RapidContextResponse } from '../types/mod.ts';
import { param, payload } from './binders.ts';
import { decorationsOf } from './registry.ts';
import { SOCKET } from './socket.ts';

describe('rapid.decorators.socket', () => {
  it('records the command with its binds', () => {
    class Chat {
      @SOCKET('chat.send', { bind: [param('room'), payload()] })
      send(room: string, message: unknown): RapidContextResponse {
        return { content: { room, echoed: message } };
      }
    }
    const [entry] = decorationsOf(Chat, 'send')!;
    asserts.assertEquals(entry.kind, 'SOCKET');
    asserts.assertEquals(
      entry.kind === 'SOCKET' ? entry.command : '',
      'chat.send',
    );
    asserts.assertEquals(entry.binds.map((b) => b.source), [
      'param',
      'payload',
    ]);
    asserts.assertEquals(new Chat().send('a', 1), {
      content: { room: 'a', echoed: 1 },
    });
  });
});
