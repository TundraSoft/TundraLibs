/**
 * @fileoverview Tests for {@link ImapClient} against the in-memory fake
 * server.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { ImapClient } from './ImapClient.ts';
import {
  ImapAuthError,
  ImapConnectionError,
  ImapMessageTooLargeError,
  ImapResponseError,
  ImapTimeoutError,
} from '../errors/mod.ts';
import {
  type FakeImapOptions,
  FakeImapServer,
  type FakeMessage,
} from './fixtures/FakeImapServer.ts';
import type { ImapClientOptions } from '../types/mod.ts';

// =============================================================================
// Fixtures
// =============================================================================

const DECODER = new TextDecoder();

// Same throwaway CA and server certificate as compat's net tests: SANs
// `DNS:db.internal` and `IP:127.0.0.1`, valid until 2126. Test material only.
const TEST_CA = `-----BEGIN CERTIFICATE-----
MIIBmTCCAT+gAwIBAgIUbWm4g72LxFM/RZMVEwFtAuGvcjUwCgYIKoZIzj0EAwIw
GTEXMBUGA1UEAwwOY29tcGF0IHRlc3QgQ0EwIBcNMjYxMDIyMjEyMTQ5WhgPMjEy
NjA5MjgyMTIxNDlaMBkxFzAVBgNVBAMMDmNvbXBhdCB0ZXN0IENBMFkwEwYHKoZI
zj0CAQYIKoZIzj0DAQcDQgAEnEQFYNyGhDOD+SAok0Y65i1MG36kR3lYzAeSofOm
gGGDbZdSJqW6ihpypxx+csycLH8aD8iAI7EfIfxoTe8jsaNjMGEwHQYDVR0OBBYE
FGlCbZfYJWvTz05r6z5sAhxXZxeMMB8GA1UdIwQYMBaAFGlCbZfYJWvTz05r6z5s
AhxXZxeMMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgIEMAoGCCqGSM49
BAMCA0gAMEUCIQClbnhljjkeajucWqLLdszA9ziogn90QT5cSwabr2YcUwIgSF01
w0aA+vt/uTGIF0mPnTfHrhpjG/Xetr79npjo3U4=
-----END CERTIFICATE-----`;
const TEST_SERVER_CERT = `-----BEGIN CERTIFICATE-----
MIIBtDCCAVqgAwIBAgIUZDiD+mn9YwVrN+xBUr3Mj229xGUwCgYIKoZIzj0EAwIw
GTEXMBUGA1UEAwwOY29tcGF0IHRlc3QgQ0EwIBcNMjYxMDIyMjEyMTQ5WhgPMjEy
NjA5MjgyMTIxNDlaMBYxFDASBgNVBAMMC2RiLmludGVybmFsMFkwEwYHKoZIzj0C
AQYIKoZIzj0DAQcDQgAEJLS5ZcnigPUSKfxQdAPveu5qsXr+atYBnQbURigAhTEj
ApweDHoVeLHb/05UGqEPNJ5FZpFAOnyJkwKhy/UyBaOBgDB+MBwGA1UdEQQVMBOC
C2RiLmludGVybmFshwR/AAABMAkGA1UdEwQCMAAwEwYDVR0lBAwwCgYIKwYBBQUH
AwEwHQYDVR0OBBYEFEsd9lCJPbJSBIhspIYnT8Bw1FXOMB8GA1UdIwQYMBaAFGlC
bZfYJWvTz05r6z5sAhxXZxeMMAoGCCqGSM49BAMCA0gAMEUCIQDzJ1rqd2iLeooQ
pLF9Ra5zStTPM/QTzHD3LnB5ikCWZAIgAXW4EiN5WDoP0j7DxGjfhbxodAFjAJEV
t6r3NAu50Ck=
-----END CERTIFICATE-----`;
const TEST_SERVER_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgldBhTCn27jZ7LWbB
mvrljgTEqedl1zPJNf9YVdG4LFuhRANCAAQktLllyeKA9RIp/FB0A+967mqxev5q
1gGdBtRGKACFMSMCnB4MehV4sdv/TlQaoQ80nkVmkUA6fImTAqHL9TIF
-----END PRIVATE KEY-----`;

const message = (
  uid: number,
  subject: string,
  extra: Partial<FakeMessage> = {},
): FakeMessage => ({
  uid,
  flags: [],
  internalDate: '10-Oct-2026 08:15:00 +0000',
  body: `From: Ada <ada@example.com>\r\nTo: help@example.com\r\n` +
    `Subject: ${subject}\r\nMessage-ID: <m${uid}@example.com>\r\n\r\n` +
    `Body of ${subject}\r\n`,
  ...extra,
});

const inbox = (): FakeMessage[] => [
  message(1, 'first', { flags: ['\\Seen'] }),
  message(2, 'second', { internalDate: '20-Oct-2026 09:00:00 +0000' }),
  message(5, 'fifth', { internalDate: '25-Oct-2026 09:00:00 +0000' }),
];

/** Start a fake, connect a client to it, run `fn`, tear both down. */
async function withClient(
  server: FakeImapOptions,
  client: Partial<ImapClientOptions>,
  fn: (c: ImapClient, s: FakeImapServer) => Promise<void>,
  connect = true,
): Promise<void> {
  const s = await FakeImapServer.start({
    mailboxes: { INBOX: inbox(), Processed: [] },
    ...server,
  });
  const c = new ImapClient({
    hostname: '127.0.0.1',
    port: s.port,
    security: 'none',
    auth: { user: 'user', pass: 'pass' },
    timeout: 5_000,
    ...client,
  });
  try {
    if (connect) await c.connect();
    await fn(c, s);
  } finally {
    c.close();
    s.close();
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('ImapClient', () => {
  describe('connect', () => {
    it('should log in and take capabilities from the greeting', async () => {
      await withClient({}, {}, async (c, s) => {
        asserts.assert(c.connected);
        asserts.assert(c.has('move'));
        asserts.assert(c.has('UIDPLUS'));
        asserts.assertEquals(s.commands.map((x) => x.name), ['LOGIN']);
        asserts.assertEquals(s.commands[0]!.args, 'user pass');
        await c.logout();
        asserts.assertFalse(c.connected);
        asserts.assertEquals(s.commands.at(-1)!.name, 'LOGOUT');
      });
    });

    it('should send CAPABILITY when the greeting carries none', async () => {
      await withClient({ greeting: '* OK ready\r\n' }, {}, async (c, s) => {
        asserts.assertEquals(s.commands.map((x) => x.name), [
          'CAPABILITY',
          'LOGIN',
        ]);
        asserts.assert(c.has('AUTH=PLAIN'));
      });
    });

    it('should authenticate with PLAIN when asked', async () => {
      await withClient(
        {},
        { auth: { user: 'user', pass: 'pass', method: 'PLAIN' } },
        async (_c, s) => {
          asserts.assertEquals(s.commands.map((x) => x.name), [
            'AUTHENTICATE',
            'CAPABILITY',
          ]);
        },
      );
    });

    it('should fall back to PLAIN when LOGIN is disabled', async () => {
      await withClient(
        { capabilities: ['IMAP4rev1', 'LOGINDISABLED', 'AUTH=PLAIN'] },
        {},
        async (_c, s) => {
          asserts.assertEquals(s.commands[0]!.name, 'AUTHENTICATE');
        },
      );
    });

    it('should refuse to send LOGIN when disabled and PLAIN is missing', async () => {
      await withClient(
        { capabilities: ['IMAP4rev1', 'LOGINDISABLED'] },
        {},
        async (c, s) => {
          const err = await asserts.assertRejects(
            () => c.connect(),
            ImapAuthError,
            'AUTH=PLAIN is not offered',
          );
          asserts.assertEquals(err.context.user, 'user');
          asserts.assertEquals(s.commands.length, 0);
          asserts.assertFalse(c.connected);
        },
        false,
      );
    });

    it('should throw ImapAuthError with the server text on bad credentials', async () => {
      await withClient(
        {},
        { auth: { user: 'user', pass: 'wrong' } },
        async (c) => {
          const err = await asserts.assertRejects(
            () => c.connect(),
            ImapAuthError,
          );
          asserts.assertStringIncludes(
            err.context.text,
            'Authentication failed',
          );
          asserts.assertFalse(c.connected);
        },
        false,
      );
    });

    it('should send a non-ASCII password as a literal', async () => {
      await withClient(
        { pass: 'pässwörd' },
        { auth: { user: 'user', pass: 'pässwörd' } },
        async (c, s) => {
          asserts.assert(c.connected);
          asserts.assertEquals(s.commands[0]!.args, 'user pässwörd');
        },
      );
    });

    it('should treat a BYE greeting as a refused connection', async () => {
      await withClient(
        { greeting: '* BYE too many connections\r\n' },
        {},
        async (c) => {
          const err = await asserts.assertRejects(
            () => c.connect(),
            ImapConnectionError,
            'too many connections',
          );
          asserts.assertEquals(err.context.operation, 'connect');
        },
        false,
      );
    });

    it('should fail starttls when the server does not offer it', async () => {
      await withClient({}, { security: 'starttls' }, async (c, s) => {
        await asserts.assertRejects(
          () => c.connect(),
          ImapConnectionError,
          'does not offer STARTTLS',
        );
        asserts.assertEquals(s.commands.length, 0);
      }, false);
    });

    it('should time out when no greeting arrives', async () => {
      await withClient({ greeting: '' }, { connectTimeout: 100 }, async (c) => {
        const started = Date.now();
        const err = await asserts.assertRejects(
          () => c.connect(),
          ImapTimeoutError,
        );
        asserts.assertEquals(err.context, {
          operation: 'connect',
          timeoutMs: 100,
        });
        asserts.assert(Date.now() - started < 2_000);
        asserts.assertFalse(c.connected);
      }, false);
    });

    it('should connect over TLS with a private CA', async () => {
      await withClient(
        { tls: { cert: TEST_SERVER_CERT, key: TEST_SERVER_KEY } },
        { security: 'tls', tls: { ca: [TEST_CA] } },
        async (c) => {
          const boxes = await c.list();
          asserts.assertEquals(boxes.map((b) => b.name), [
            'INBOX',
            'Processed',
          ]);
        },
      );
    });

    it('should reject a second connect on an open client', async () => {
      await withClient({}, {}, async (c) => {
        await asserts.assertRejects(
          () => c.connect(),
          ImapConnectionError,
          'already connected',
        );
      });
    });
  });

  describe('mailboxes', () => {
    it('should list mailboxes with decoded names and attributes', async () => {
      await withClient(
        { mailboxes: { INBOX: [], 'Entw&APw-rfe': [] } },
        {},
        async (c) => {
          const boxes = await c.list();
          asserts.assertEquals(boxes, [
            { name: 'INBOX', delimiter: '/', attributes: ['\\HasNoChildren'] },
            {
              name: 'Entwürfe',
              delimiter: '/',
              attributes: ['\\HasNoChildren'],
            },
          ]);
        },
      );
    });

    it('should create a mailbox and report NO with its code on a duplicate', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.create('Brevily-Failed');
        asserts.assertEquals(s.mailboxes['Brevily-Failed'], []);
        const err = await asserts.assertRejects(
          () => c.create('Brevily-Failed'),
          ImapResponseError,
        );
        asserts.assertEquals(err.context.status, 'NO');
        asserts.assertEquals(err.context.code, 'ALREADYEXISTS');
        asserts.assertEquals(err.context.command, 'CREATE');
        asserts.assert(c.connected);
      });
    });

    it('should select a mailbox and report its status', async () => {
      await withClient({}, {}, async (c) => {
        const status = await c.select('INBOX');
        asserts.assertEquals(status, {
          name: 'INBOX',
          readOnly: false,
          exists: 3,
          recent: 0,
          unseen: 2,
          flags: ['\\Answered', '\\Flagged', '\\Deleted', '\\Seen', '\\Draft'],
          permanentFlags: ['\\Seen', '\\Deleted', '\\*'],
          uidValidity: 1761500000,
          uidNext: 6,
        });
        asserts.assertEquals(c.mailbox, status);
        const examined = await c.examine('Processed');
        asserts.assertEquals(examined.readOnly, true);
        asserts.assertEquals(examined.exists, 0);
      });
    });

    it('should clear the selected mailbox when SELECT fails', async () => {
      await withClient({}, {}, async (c) => {
        await c.select('INBOX');
        const err = await asserts.assertRejects(
          () => c.select('Nope'),
          ImapResponseError,
        );
        asserts.assertEquals(err.context.code, 'NONEXISTENT');
        asserts.assertEquals(c.mailbox, undefined);
      });
    });
  });

  describe('search', () => {
    it('should return every UID for empty criteria', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.select('INBOX');
        asserts.assertEquals(await c.search(), [1, 2, 5]);
        asserts.assertEquals(s.commands.at(-1)!.args, 'ALL');
      });
    });

    it('should translate flag, date and uid criteria', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.select('INBOX');
        asserts.assertEquals(await c.search({ seen: false }), [2, 5]);
        asserts.assertEquals(s.commands.at(-1)!.args, 'UNSEEN');
        asserts.assertEquals(
          await c.search({ since: new Date('2026-10-20T00:00:00Z') }),
          [2, 5],
        );
        asserts.assertEquals(s.commands.at(-1)!.args, 'SINCE 20-Oct-2026');
        asserts.assertEquals(
          await c.search({ before: new Date('2026-10-20T23:59:59Z') }),
          [1],
        );
        asserts.assertEquals(s.commands.at(-1)!.args, 'BEFORE 20-Oct-2026');
        asserts.assertEquals(await c.search({ uid: [1, 2, 3, 5] }), [1, 2, 5]);
        asserts.assertEquals(s.commands.at(-1)!.args, 'UID 1:3,5');
        asserts.assertEquals(await c.search({ uid: '2:*' }), [2, 5]);
      });
    });

    it('should send non-ASCII text as a literal with CHARSET UTF-8', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.select('INBOX');
        asserts.assertEquals(await c.search({ subject: 'fünf' }), []);
        asserts.assertEquals(
          s.commands.at(-1)!.args,
          'CHARSET UTF-8 SUBJECT fünf',
        );
      });
    });

    it('should read an ESEARCH reply', async () => {
      await withClient({ esearch: true }, {}, async (c) => {
        await c.select('INBOX');
        asserts.assertEquals(await c.search(), [1, 2, 5]);
      });
    });

    it('should surface BAD for an unknown raw key', async () => {
      await withClient({}, {}, async (c) => {
        await c.select('INBOX');
        const err = await asserts.assertRejects(
          () => c.search({ raw: 'BOGUS' }),
          ImapResponseError,
          'Unknown search key',
        );
        asserts.assertEquals(err.context.status, 'BAD');
        await c.noop(); // the connection survives a BAD
      });
    });
  });

  describe('fetch', () => {
    it('should return the requested items', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.select('INBOX');
        const [m] = await c.fetch(2, [
          'flags',
          'internalDate',
          'size',
          'body',
          'header',
        ]);
        asserts.assertEquals(
          s.commands.at(-1)!.args,
          '2 (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[] BODY.PEEK[HEADER])',
        );
        const original = s.mailboxes['INBOX']![1]!.body;
        asserts.assertEquals(m!.uid, 2);
        asserts.assertEquals(m!.seq, 2);
        asserts.assertEquals(m!.flags, []);
        asserts.assertEquals(
          m!.internalDate,
          new Date('2026-10-20T09:00:00Z'),
        );
        asserts.assertEquals(m!.size, original.length);
        asserts.assertEquals(DECODER.decode(m!.body), original);
        asserts.assert(DECODER.decode(m!.header).endsWith('\r\n\r\n'));
        asserts.assertEquals(m!.envelope, undefined);
      });
    });

    it('should reassemble a literal split across many reads', async () => {
      const body = message(7, 'big').body + 'x'.repeat(5000) + '\r\n';
      await withClient(
        {
          literalChunk: 7,
          mailboxes: {
            INBOX: [message(7, 'big', { body }), message(8, 'next')],
          },
        },
        {},
        async (c) => {
          await c.select('INBOX');
          const msgs = await c.fetch([7, 8], ['body', 'size']);
          asserts.assertEquals(msgs.map((m) => m.uid), [7, 8]);
          asserts.assertEquals(DECODER.decode(msgs[0]!.body), body);
          asserts.assertEquals(msgs[0]!.size, body.length);
          asserts.assertEquals(
            DECODER.decode(msgs[1]!.body),
            message(8, 'next').body,
          );
        },
      );
    });

    it('should parse an ENVELOPE with encoded words and groups', async () => {
      const envelope =
        '("Mon, 26 Oct 2026 10:00:00 +0100" "=?UTF-8?Q?Caf=C3=A9_order?=" ' +
        '(("=?UTF-8?B?QWRhIEzDtnZlbGFjZQ==?=" NIL "ada" "example.com")) ' +
        'NIL NIL ((NIL NIL "team" NIL) (NIL NIL "help" "example.com") (NIL NIL NIL NIL)) ' +
        'NIL NIL "<parent@example.com>" "<m9@example.com>")';
      await withClient(
        { mailboxes: { INBOX: [message(9, 'env', { envelope })] } },
        {},
        async (c) => {
          await c.select('INBOX');
          const [m] = await c.fetch(9, ['envelope']);
          asserts.assertEquals(m!.envelope, {
            date: 'Mon, 26 Oct 2026 10:00:00 +0100',
            subject: 'Café order',
            from: [{ name: 'Ada Lövelace', address: 'ada@example.com' }],
            sender: [],
            replyTo: [],
            to: [{ address: 'help@example.com' }],
            cc: [],
            bcc: [],
            inReplyTo: '<parent@example.com>',
            messageId: 'm9@example.com',
          });
        },
      );
    });

    it('should drain an oversized body and throw ImapMessageTooLargeError', async () => {
      const body = message(3, 'huge').body + 'y'.repeat(20_000) + '\r\n';
      await withClient(
        { mailboxes: { INBOX: [message(3, 'huge', { body })] } },
        { maxSize: 1024 },
        async (c) => {
          await c.select('INBOX');
          const err = await asserts.assertRejects(
            () => c.fetch(3, ['body']),
            ImapMessageTooLargeError,
          );
          asserts.assertEquals(err.context, {
            uid: 3,
            size: body.length,
            maxSize: 1024,
          });
          // The excess was consumed: the connection is in sync and usable.
          asserts.assert(c.connected);
          const [m] = await c.fetch(3, ['header', 'size']);
          asserts.assertEquals(m!.size, body.length);
          asserts.assert(DECODER.decode(m!.header).startsWith('From: Ada'));
          // A larger per-call limit reads it whole.
          const [full] = await c.fetch(3, ['body'], { maxSize: 100_000 });
          asserts.assertEquals(full!.body!.length, body.length);
        },
      );
    });

    it('should omit UIDs the server does not report', async () => {
      await withClient({}, {}, async (c) => {
        await c.select('INBOX');
        const msgs = await c.fetch([1, 4], ['flags']);
        asserts.assertEquals(msgs.map((m) => m.uid), [1]);
        asserts.assertEquals(msgs[0]!.flags, ['\\Seen']);
      });
    });
  });

  describe('store, copy, move, expunge', () => {
    it('should add, remove and set flags silently', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.select('INBOX');
        const box = s.mailboxes['INBOX']!;
        await c.store(2, ['\\Seen', '\\Flagged']);
        asserts.assertEquals(
          s.commands.at(-1)!.args,
          '2 +FLAGS.SILENT (\\Seen \\Flagged)',
        );
        asserts.assertEquals(box[1]!.flags, ['\\Seen', '\\Flagged']);
        await c.store(2, ['\\Flagged'], 'remove');
        asserts.assertEquals(box[1]!.flags, ['\\Seen']);
        await c.store([1, 2], ['\\Deleted'], 'set');
        asserts.assertEquals(
          s.commands.at(-1)!.args,
          '1:2 FLAGS.SILENT (\\Deleted)',
        );
        asserts.assertEquals(box[0]!.flags, ['\\Deleted']);
      });
    });

    it('should reject a flag with illegal characters before sending', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.select('INBOX');
        const sent = s.commands.length;
        await asserts.assertRejects(
          () => c.store(1, ['bad flag']),
          Error,
          'Invalid IMAP flag',
        );
        asserts.assertEquals(s.commands.length, sent);
      });
    });

    it('should use UID MOVE when advertised', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.select('INBOX');
        await c.move(2, 'Processed');
        asserts.assertEquals(s.commands.at(-1)!.name, 'UID MOVE');
        asserts.assertEquals(s.commands.at(-1)!.args, '2 "Processed"');
        asserts.assertEquals(s.mailboxes['INBOX']!.map((m) => m.uid), [1, 5]);
        asserts.assertEquals(s.mailboxes['Processed']!.length, 1);
        asserts.assertEquals(
          s.mailboxes['Processed']![0]!.body,
          message(2, 'second').body,
        );
        // The unsolicited `* n EXPUNGE` did not break the next command.
        asserts.assertEquals(await c.search(), [1, 5]);
      });
    });

    it('should fall back to COPY, STORE and UID EXPUNGE without MOVE', async () => {
      await withClient(
        { capabilities: ['IMAP4rev1', 'UIDPLUS'] },
        {},
        async (c, s) => {
          await c.select('INBOX');
          const before = s.commands.length;
          await c.move([2, 5], 'Processed');
          asserts.assertEquals(
            s.commands.slice(before).map((x) => `${x.name} ${x.args}`),
            [
              'UID COPY 2,5 "Processed"',
              'UID STORE 2,5 +FLAGS.SILENT (\\Deleted)',
              'UID EXPUNGE 2,5',
            ],
          );
          asserts.assertEquals(s.mailboxes['INBOX']!.map((m) => m.uid), [1]);
          asserts.assertEquals(s.mailboxes['Processed']!.length, 2);
        },
      );
    });

    it('should fall back to a plain EXPUNGE without UIDPLUS', async () => {
      await withClient(
        { capabilities: ['IMAP4rev1'] },
        {},
        async (c, s) => {
          await c.select('INBOX');
          await c.move(5, 'Processed');
          asserts.assertEquals(s.commands.at(-1)!.name, 'EXPUNGE');
          asserts.assertEquals(s.mailboxes['INBOX']!.map((m) => m.uid), [1, 2]);
        },
      );
    });

    it('should report TRYCREATE when the target mailbox is missing', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.select('INBOX');
        const err = await asserts.assertRejects(
          () => c.copy(1, 'Missing'),
          ImapResponseError,
        );
        asserts.assertEquals(err.context.code, 'TRYCREATE');
        asserts.assertEquals(s.mailboxes['INBOX']!.length, 3);
      });
    });

    it('should count expunged messages', async () => {
      await withClient({}, {}, async (c, s) => {
        await c.select('INBOX');
        await c.store([1, 2], ['\\Deleted']);
        asserts.assertEquals(await c.expunge([1, 2, 5]), 2);
        asserts.assertEquals(s.commands.at(-1)!.args, '1:2,5');
        asserts.assertEquals(s.mailboxes['INBOX']!.map((m) => m.uid), [5]);
        asserts.assertEquals(await c.expunge(), 0);
        asserts.assertEquals(s.commands.at(-1)!.name, 'EXPUNGE');
      });
    });
  });

  describe('failure modes', () => {
    it('should time out a command, close the socket, and name the command', async () => {
      await withClient(
        {
          before: (cmd) =>
            cmd.name === 'NOOP' ? new Promise<boolean>(() => {}) : undefined,
        },
        { timeout: 150 },
        async (c) => {
          const started = Date.now();
          const err = await asserts.assertRejects(
            () => c.noop(),
            ImapTimeoutError,
          );
          asserts.assertEquals(err.context, {
            operation: 'NOOP',
            timeoutMs: 150,
          });
          asserts.assert(Date.now() - started < 2_000);
          asserts.assertFalse(c.connected);
          await asserts.assertRejects(
            () => c.noop(),
            ImapConnectionError,
            'not connected',
          );
        },
      );
    });

    it('should honour the abort signal', async () => {
      const controller = new AbortController();
      await withClient(
        {
          before: (cmd) => {
            if (cmd.name !== 'NOOP') return;
            controller.abort(new Error('job cancelled'));
            return new Promise<boolean>(() => {});
          },
        },
        { signal: controller.signal },
        async (c) => {
          const err = await asserts.assertRejects(
            () => c.noop(),
            ImapConnectionError,
            'aborted',
          );
          asserts.assertEquals(err.cause?.message, 'job cancelled');
          asserts.assertFalse(c.connected);
        },
      );
    });

    it('should report a connection cut mid-reply', async () => {
      await withClient(
        {
          before: async (cmd, ctx) => {
            if (cmd.name !== 'UID FETCH') return;
            await ctx.write('* 1 FETCH (UID 1 BODY[] {500}\r\npartial');
            ctx.close();
            return false;
          },
        },
        {},
        async (c) => {
          await c.select('INBOX');
          const err = await asserts.assertRejects(
            () => c.fetch(1, ['body']),
            ImapConnectionError,
            'connection closed',
          );
          asserts.assertEquals(err.context.operation, 'UID FETCH');
          asserts.assertFalse(c.connected);
        },
      );
    });

    it('should reject a second command while one is in flight', async () => {
      await withClient({}, {}, async (c) => {
        const first = c.noop();
        await asserts.assertRejects(
          () => c.noop(),
          ImapConnectionError,
          'in flight',
        );
        await first;
      });
    });

    it('should tolerate a server that drops the line after BYE', async () => {
      await withClient(
        {
          before: async (cmd, ctx) => {
            if (cmd.name !== 'LOGOUT') return;
            await ctx.write('* BYE bye\r\n');
            ctx.close();
            return false;
          },
        },
        {},
        async (c) => {
          await c.logout();
          asserts.assertFalse(c.connected);
        },
      );
    });

    it('should reject commands before connect', async () => {
      const c = new ImapClient({
        hostname: '127.0.0.1',
        port: 1,
        security: 'none',
        auth: { user: 'u', pass: 'p' },
      });
      await asserts.assertRejects(
        () => c.fetch(1, ['body']),
        ImapConnectionError,
        'not connected',
      );
      await c.logout(); // a no-op when never connected
    });
  });
});
