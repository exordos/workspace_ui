/**
 * MIME parsing tests — quoted-printable, encoded headers, multipart.
 */

import { describe, expect, it } from "vitest";
import {
  buildForwardSubject,
  buildMailSnippet,
  buildPlainTextFallback,
  buildQuotedHtml,
  buildReplySubject,
  decodeMailHeaderValue,
  decodeQuotedPrintableUtf8,
  looksLikeUndecodedQuotedPrintable,
  parseMailMimeSource,
  parseRawHeaderFields,
  resolveMailFrom,
  resolveMailSubject,
} from "./mime.lib";

const RAW_QP_SUBJECT_RU = `From: sender@example.test
To: doublek@example.test
Subject: =D0=9F=D1=80=D0=B8=D0=B2=D0=B5=D1=82 =D0=B8=D0=B7 =D0=BF=D0=BE=D1=87=D1=82=D1=8B
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

=D0=9F=D1=80=D0=B8=D0=B2=D0=B5=D1=82!
`;

const QUOTED_PRINTABLE_RU = `From: sender@example.test
To: doublek@example.test
Subject: Calendar folder
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

=D0=9F=D0=B0=D0=BF=D0=BA=D0=B0 "=D0=9F=D0=B5=D1=80=D1=81=D0=BE=D0=BD=D0=B0=D0=BB=D1=8C=D0=BD=D1=8B=D0=B9 =D0=BA=D0=B0=D0=BB=D0=B5=D0=BD=D0=B4=D0=B0=D1=80=D1=8C" =D0=B1=D1=8B=D0=BB=D0=B0 =D1=81=D0=BE=D0=B7=D0=B4=D0=B0=D0=BD=D0=B0.
`;

const SOGO_MULTIPART_RU = `From: doublek@example.test
To: doublek@example.test
Subject: =?utf-8?q?=22=D0=9F=D0=B5=D1=80=D1=81=D0=BE=D0=BD=D0=B0=D0=BB=D1=8C?= =?utf-8?q?=D0=BD=D1=8B=D0=B9?= =?utf-8?q?_=D0=BA=D0=B0=D0=BB=D0=B5=D0=BD=D0=B4=D0=B0=D1=80=D1=8C=22?= =?utf-8?q?_=D1=81=D0=BE=D0=B7=D0=B4=D0=B0=D0=BD=D0=BE?=
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="----=_=-_OpenGroupware_org_NGMime-55-1781175001.308579-0------"

------=_=-_OpenGroupware_org_NGMime-55-1781175001.308579-0------
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

=D0=9F=D0=B0=D0=BF=D0=BA=D0=B0 "=D0=9F=D0=B5=D1=80=D1=81=D0=BE=D0=BD=D0=B0=D0=BB=D1=8C=D0=BD=D1=8B=D0=B9 =D0=BA=D0=B0=D0=BB=D0=B5=D0=BD=D0=B4=D0=B0=D1=80=D1=8C" =D0=B1=D1=8B=D0=BB=D0=B0 =D1=81=D0=BE=D0=B7=D0=B4=D0=B0=D0=BD=D0=B0.

------=_=-_OpenGroupware_org_NGMime-55-1781175001.308579-0------
Content-Type: application/x-sogo-notification; method=add
Content-Transfer-Encoding: base64

aHR0cHM6Ly9tYWlsLmV4YW1wbGUudGVzdC9TT0dvL3NvL2RvdWJsZWtAZXhhbXBsZS50ZXN0L0NhbGVuZGFyL3BlcnNvbmFsLw==

------=_=-_OpenGroupware_org_NGMime-55-1781175001.308579-0--------
`;

describe("mail-mime.lib", () => {
  it("decodes quoted-printable UTF-8 Russian text", async () => {
    const parsed = await parseMailMimeSource(QUOTED_PRINTABLE_RU);
    expect(parsed.text).toBe('Папка "Персональный календарь" была создана.');
    expect(parsed.html).toBeNull();
  });

  it("decodes SOGo multipart notification subject and body", async () => {
    const parsed = await parseMailMimeSource(SOGO_MULTIPART_RU);
    expect(parsed.text).toBe('Папка "Персональный календарь" была создана.');
    expect(parsed.subject).toContain("Персональный календарь");
    expect(parsed.subject).not.toContain("=?utf-8");
    expect(parsed.from).toBe("doublek@example.test");
  });

  it("decodes raw quoted-printable Subject headers without MIME encoded-words", async () => {
    const parsed = await parseMailMimeSource(RAW_QP_SUBJECT_RU);
    expect(parsed.subject).toBe("Привет из почты");
    expect(parsed.text).toBe("Привет!");
    expect(parsed.subject).not.toContain("=D0");
  });

  it("decodes MIME encoded-word headers", () => {
    const encoded =
      '=?utf-8?q?=22=D0=9F=D0=B5=D1=80=D1=81=D0=BE=D0=BD=D0=B0=D0=BB=D1=8C?= =?utf-8?q?=D0=BD=D1=8B=D0=B9?= =?utf-8?q?_=D0=BA=D0=B0=D0=BB=D0=B5=D0=BD=D0=B4=D0=B0=D1=80=D1=8C=22?= =?utf-8?q?_=D1=81=D0=BE=D0=B7=D0=B4=D0=B0=D0=BD=D0=BE?=';
    expect(decodeMailHeaderValue(encoded)).toContain("Персональный календарь");
  });

  it("decodes standalone quoted-printable header fragments", () => {
    const raw = "=D0=9F=D1=80=D0=B8=D0=B2=D0=B5=D1=82";
    expect(looksLikeUndecodedQuotedPrintable(raw)).toBe(true);
    expect(decodeQuotedPrintableUtf8(raw)).toBe("Привет");
    expect(decodeMailHeaderValue(raw)).toBe("Привет");
  });

  it("resolveMailSubject prefers decoded parsed subject over encoded envelope", () => {
    const encoded =
      '=?utf-8?q?=22=D0=9F=D0=B5=D1=80=D1=81=D0=BE=D0=BD=D0=B0=D0=BB=D1=8C?= =?utf-8?q?=D0=BD=D1=8B=D0=B9?=';
    expect(resolveMailSubject('"Персональный календарь" создано', encoded)).toBe(
      '"Персональный календарь" создано',
    );
    expect(resolveMailSubject(null, encoded)).toContain("Персональный");
    expect(resolveMailSubject("=D0=9F=D1=80=D0=B8=D0=B2=D0=B5=D1=82", encoded)).toBe("Привет");
    expect(
      resolveMailSubject(null, '"Персональный', encoded),
    ).toContain("Персональный");
  });

  it("parses raw Subject/From header fields and decodes Cyrillic", () => {
    const headers = Buffer.from(
      'Subject: =?utf-8?q?=22=D0=9F=D0=B5=D1=80=D1=81=D0=BE=D0=BD=D0=B0=D0=BB=D1=8C?= =?utf-8?q?=D0=BD=D1=8B=D0=B9?= =?utf-8?q?_=D0=BA=D0=B0=D0=BB=D0=B5=D0=BD=D0=B4=D0=B0=D1=80=D1=8C=22?=\r\nFrom: =D0=98=D0=B2=D0=B0=D0=BD <ivan@example.test>\r\n',
      "utf8",
    );
    const fields = parseRawHeaderFields(headers);
    expect(resolveMailSubject(null, undefined, fields.subject)).toContain("Персональный календарь");
    expect(resolveMailFrom(null, "broken", fields.from)).toContain("Иван");
  });

  it("decodes quoted-printable embedded in HTML", async () => {
    const htmlOnly = `From: a@test
Subject: Test
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: 8bit

<html><body><p>=D0=9F=D1=80=D0=B8=D0=B2=D0=B5=D1=82</p></body></html>`;
    const parsed = await parseMailMimeSource(htmlOnly);
    expect(parsed.html).toContain("Привет");
    expect(parsed.html).not.toContain("=D0");
  });

  it("builds snippet from decoded plain text", () => {
    const snippet = buildMailSnippet('Папка "Персональный календарь" была создана.', null);
    expect(snippet).toContain("Персональный календарь");
    expect(snippet).not.toContain("=D0");
  });

  it("returns null fields for empty input", async () => {
    await expect(parseMailMimeSource(undefined)).resolves.toEqual({
      text: null,
      html: null,
      subject: null,
      from: null,
      messageId: null,
      replyTo: null,
      to: [],
      cc: [],
      references: null,
    });
  });

  it("buildReplySubject prefixes Re:", () => {
    expect(buildReplySubject("Hello")).toBe("Re: Hello");
    expect(buildReplySubject("Re: Hello")).toBe("Re: Hello");
  });

  it("buildForwardSubject prefixes Fwd:", () => {
    expect(buildForwardSubject("Hello")).toBe("Fwd: Hello");
    expect(buildForwardSubject("Fwd: Hello")).toBe("Fwd: Hello");
  });

  it("buildQuotedHtml wraps original body in blockquote", () => {
    const html = buildQuotedHtml({
      from: "Alice <alice@test>",
      date: "2026-01-01",
      subject: "Hi",
      bodyHtml: null,
      bodyText: "Hello world",
    });
    expect(html).toContain("blockquote");
    expect(html).toContain("Hello world");
  });

  it("buildPlainTextFallback strips HTML tags", () => {
    expect(buildPlainTextFallback("<p>Hello<br>world</p>")).toContain("Hello");
  });
});
