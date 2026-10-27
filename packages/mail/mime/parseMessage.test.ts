/**
 * @fileoverview Tests for {@link parseMessage} on real-world shaped mail.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { parseMessage } from './parseMessage.ts';

// =============================================================================
// Fixtures
// =============================================================================

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/** Join lines with CRLF and encode. */
const eml = (lines: string[]): Uint8Array =>
  ENCODER.encode(lines.join('\r\n') + '\r\n');

const PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
]);
const PNG_BASE64 = 'iVBORw0KGgo=';

const ALTERNATIVE_WITH_ATTACHMENTS = eml([
  'Return-Path: <ada@example.com>',
  'From: =?UTF-8?B?QWRhIEzDtnZlbGFjZQ==?= <ada@example.com>',
  'To: Help Desk <help@example.com>, cc-me@example.com (Carbon Copy)',
  'Reply-To: ada+replies@example.com',
  'Subject: =?UTF-8?Q?Caf=C3=A9_order?= =?UTF-8?Q?_=E2=80=93_receipt?=',
  'Date: Mon, 26 Oct 2026 10:15:30 +0100',
  'Message-ID: <m1@example.com>',
  'In-Reply-To: <m0@example.com>',
  'References: <m-1@example.com>',
  '  <m0@example.com>',
  'Auto-Submitted: Auto-Replied',
  'Precedence: Bulk',
  'List-Id: Orders <orders.example.com>',
  'X-Autoreply: yes',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="outer"',
  '',
  'This is a multi-part message in MIME format.',
  '--outer',
  'Content-Type: multipart/alternative; boundary=inner',
  '',
  '--inner',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Caf=C3=A9 =E2=80=93 your order is on its way.=',
  '',
  'Thanks!',
  '--inner',
  'Content-Type: text/html; charset="utf-8"',
  'Content-Transfer-Encoding: base64',
  '',
  'PHA+Q2Fmw6kg4oCTIHlvdXIgb3JkZXIgaXMgb24gaXRzIHdheS48L3A+',
  '--inner--',
  '--outer',
  'Content-Type: application/pdf; name="fallback.pdf"',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment;',
  " filename*0*=utf-8''r%C3%A9sum;",
  ' filename*1*=%C3%A9.pdf',
  '',
  'JVBERi0xLjQK',
  '--outer',
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  'Content-ID: <logo@example.com>',
  'Content-Disposition: inline; filename=logo.png',
  '',
  PNG_BASE64,
  '--outer--',
  'trailing epilogue',
]);

const LATIN1 = (() => {
  const head = eml([
    'From: bob@example.com',
    'Subject: =?ISO-8859-1?Q?Gr=FC=DFe?=',
    'Content-Type: text/plain; charset=iso-8859-1',
    'Content-Transfer-Encoding: 8bit',
    '',
  ]);
  const body = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0d, 0x0a]); // "café\r\n"
  const out = new Uint8Array(head.length + body.length);
  out.set(head);
  out.set(body, head.length);
  return out;
})();

const FORWARDED = eml([
  'From: carol@example.com',
  'To: help@example.com',
  'Subject: Fwd: the original',
  'Content-Type: multipart/mixed; boundary=fwd',
  '',
  '--fwd',
  'Content-Type: text/plain',
  '',
  'See below.',
  '--fwd',
  'Content-Type: message/rfc822',
  'Content-Disposition: attachment',
  '',
  'From: dave@example.com',
  'Subject: the original',
  'Message-ID: <orig@example.com>',
  'Content-Type: text/plain',
  '',
  'Original body.',
  '--fwd--',
]);

const BROKEN = ENCODER.encode([
  ' leading continuation with nothing to continue',
  'From: Eve <eve@example.com',
  'Subject: Bare 8-bit ümlaut and an unterminated =?UTF-8?Q?word',
  'this line has no colon',
  'Date: not a date at all',
  'Content-Type: multipart/mixed; boundary=never-closed',
  'Content-Transfer-Encoding: base64;',
  '',
  '--never-closed',
  'Content-Type: text/plain; charset=x-no-such-charset',
  '',
  'still readable',
  '--never-closed',
  'Content-Type: application/octet-stream',
  'Content-Transfer-Encoding: base64',
  '',
  'AAEC AwQ=',
].join('\n'));

// =============================================================================
// Tests
// =============================================================================

describe('parseMessage', () => {
  describe('multipart/alternative with attachments', () => {
    const msg = parseMessage(ALTERNATIVE_WITH_ATTACHMENTS);

    it('should decode encoded-word headers and addresses', () => {
      asserts.assertEquals(msg.subject, 'Café order – receipt');
      asserts.assertEquals(msg.from, [
        { name: 'Ada Lövelace', address: 'ada@example.com' },
      ]);
      asserts.assertEquals(msg.to, [
        { name: 'Help Desk', address: 'help@example.com' },
        { name: 'Carbon Copy', address: 'cc-me@example.com' },
      ]);
      asserts.assertEquals(msg.replyTo, [{
        address: 'ada+replies@example.com',
      }]);
      asserts.assertEquals(msg.cc, []);
      asserts.assertEquals(msg.date, new Date('2026-10-26T09:15:30Z'));
    });

    it('should parse message ids, unfolding References', () => {
      asserts.assertEquals(msg.messageId, 'm1@example.com');
      asserts.assertEquals(msg.inReplyTo, ['m0@example.com']);
      asserts.assertEquals(msg.references, [
        'm-1@example.com',
        'm0@example.com',
      ]);
    });

    it('should expose the auto-reply signals', () => {
      asserts.assertEquals(msg.autoSubmitted, 'auto-replied');
      asserts.assertEquals(msg.precedence, 'bulk');
      asserts.assertEquals(msg.listId, 'Orders <orders.example.com>');
      asserts.assertEquals(msg.xAutoreply, 'yes');
    });

    it('should pick the text and html bodies out of the alternative', () => {
      asserts.assertEquals(
        msg.text,
        'Café – your order is on its way.\r\nThanks!',
      );
      asserts.assertEquals(
        msg.html,
        '<p>Café – your order is on its way.</p>',
      );
    });

    it('should list attachments with RFC 2231 names, bytes and content ids', () => {
      asserts.assertEquals(msg.attachments.length, 2);
      const [pdf, png] = msg.attachments;
      asserts.assertEquals(pdf!.filename, 'résumé.pdf');
      asserts.assertEquals(pdf!.contentType, 'application/pdf');
      asserts.assertEquals(pdf!.disposition, 'attachment');
      asserts.assertEquals(DECODER.decode(pdf!.content), '%PDF-1.4\n');
      asserts.assertEquals(pdf!.size, 9);
      asserts.assertEquals(png!.filename, 'logo.png');
      asserts.assertEquals(png!.disposition, 'inline');
      asserts.assertEquals(png!.contentId, 'logo@example.com');
      asserts.assertEquals(png!.content, PNG_BYTES);
    });

    it('should keep the full part tree', () => {
      asserts.assertEquals(msg.root.contentType.subtype, 'mixed');
      asserts.assertEquals(msg.root.children.length, 3);
      const alternative = msg.root.children[0]!;
      asserts.assertEquals(alternative.contentType.subtype, 'alternative');
      asserts.assertEquals(
        alternative.children.map((c) => c.contentType.subtype),
        ['plain', 'html'],
      );
      asserts.assertEquals(
        alternative.children[0]!.encoding,
        'quoted-printable',
      );
      asserts.assertEquals(alternative.children[0]!.charset, 'utf-8');
      asserts.assertEquals(msg.root.content.length, 0);
    });
  });

  it('should decode a non-UTF-8 charset in the body and the subject', () => {
    const msg = parseMessage(LATIN1);
    asserts.assertEquals(msg.subject, 'Grüße');
    asserts.assertEquals(msg.text, 'café\r\n');
    asserts.assertEquals(msg.root.charset, 'iso-8859-1');
  });

  it('should parse a forwarded message/rfc822 part as both attachment and message', () => {
    const msg = parseMessage(FORWARDED);
    asserts.assertEquals(msg.text, 'See below.');
    asserts.assertEquals(msg.attachments.length, 1);
    asserts.assertEquals(msg.attachments[0]!.contentType, 'message/rfc822');
    asserts.assert(
      DECODER.decode(msg.attachments[0]!.content).startsWith('From: dave@'),
    );
    const inner = msg.root.children[1]!.message!;
    asserts.assertEquals(inner.subject, 'the original');
    asserts.assertEquals(inner.messageId, 'orig@example.com');
    asserts.assertEquals(inner.from, [{ address: 'dave@example.com' }]);
    asserts.assertEquals(inner.text, 'Original body.');
  });

  it('should tolerate broken headers, LF line endings and a missing closing boundary', () => {
    const msg = parseMessage(BROKEN);
    asserts.assertEquals(msg.from, [{
      name: 'Eve',
      address: 'eve@example.com',
    }]);
    asserts.assertEquals(
      msg.subject,
      'Bare 8-bit ümlaut and an unterminated =?UTF-8?Q?word',
    );
    asserts.assertEquals(msg.date, undefined);
    asserts.assertEquals(msg.root.encoding, 'base64');
    asserts.assertEquals(msg.text, 'still readable');
    asserts.assertEquals(msg.attachments.length, 1);
    asserts.assertEquals(
      msg.attachments[0]!.content,
      new Uint8Array([0, 1, 2, 3, 4]),
    );
    asserts.assertEquals(
      msg.headers.map((h) => h.name),
      ['From', 'Subject', 'Date', 'Content-Type', 'Content-Transfer-Encoding'],
    );
  });

  it('should read a message with no blank line as headers only', () => {
    const msg = parseMessage(ENCODER.encode('Subject: only\r\nFrom: a@b.c'));
    asserts.assertEquals(msg.subject, 'only');
    asserts.assertEquals(msg.text, '');
    asserts.assertEquals(msg.attachments, []);
  });

  it('should read a multipart with no boundary as plain text', () => {
    const msg = parseMessage(eml([
      'Content-Type: multipart/mixed',
      '',
      'just text',
    ]));
    asserts.assertEquals(msg.text, 'just text\r\n');
    asserts.assertEquals(msg.root.contentType.type, 'multipart');
  });

  it('should treat a text part with a filename as an attachment', () => {
    const msg = parseMessage(eml([
      'Content-Type: multipart/mixed; boundary=b',
      '',
      '--b',
      'Content-Type: text/plain',
      '',
      'the body',
      '--b',
      'Content-Type: text/plain; name=notes.txt',
      'Content-Disposition: inline; filename=notes.txt',
      '',
      'the notes',
      '--b--',
    ]));
    asserts.assertEquals(msg.text, 'the body');
    asserts.assertEquals(msg.attachments.map((a) => a.filename), ['notes.txt']);
    asserts.assertEquals(msg.attachments[0]!.disposition, 'inline');
  });

  it('should concatenate several body text parts in order', () => {
    const msg = parseMessage(eml([
      'Content-Type: multipart/mixed; boundary=b',
      '',
      '--b',
      'Content-Type: text/plain',
      '',
      'one',
      '--b',
      'Content-Type: text/plain',
      '',
      'two',
      '--b--',
    ]));
    asserts.assertEquals(msg.text, 'one\ntwo');
  });

  it('should return an empty message for empty input', () => {
    const msg = parseMessage(new Uint8Array(0));
    asserts.assertEquals(msg.from, []);
    asserts.assertEquals(msg.subject, undefined);
    asserts.assertEquals(msg.text, '');
    asserts.assertEquals(msg.headers, []);
  });
});
