/**
 * MIME debug logging helpers — tests.
 */

import { describe, expect, it } from "vitest";
import { mailDebugTestUtils } from "./mail-debug.lib";

const { describeMailTextEncoding, previewMailText } = mailDebugTestUtils;

describe("mail-debug.lib", () => {
  it("previewMailText truncates long values", () => {
    const long = "a".repeat(200);
    const preview = previewMailText(long);
    expect(preview).not.toBeNull();
    expect(preview!.length).toBeLessThan(200);
    expect(preview!.endsWith("…")).toBe(true);
  });

  it("describeMailTextEncoding flags quoted-printable Cyrillic", () => {
    const snapshot = describeMailTextEncoding("=D0=9F=D1=80=D0=B8=D0=B2=D0=B5=D1=82");
    expect(snapshot).toMatchObject({
      hasCyrillic: false,
      hasMimeEncodedWords: false,
      looksLikeUndecodedQuotedPrintable: true,
    });
    expect(snapshot?.qpTokenCount).toBeGreaterThan(0);
  });

  it("describeMailTextEncoding flags decoded Cyrillic", () => {
    const snapshot = describeMailTextEncoding("Привет");
    expect(snapshot).toMatchObject({
      hasCyrillic: true,
      looksLikeUndecodedQuotedPrintable: false,
    });
  });
});
