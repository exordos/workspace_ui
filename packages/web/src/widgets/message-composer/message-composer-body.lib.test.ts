import { describe, expect, it } from "vitest";
import {
  buildOutgoingMessageBody,
  formatAttachmentSize,
  formatScheduledTimestamp,
  getAttachmentExtensionLabel,
  resolveTomorrowMorningTimestamp,
} from "./message-composer-body.lib";

describe("message-composer-body.lib", () => {
  describe("buildOutgoingMessageBody", () => {
    it("returns trimmed value without quote", () => {
      expect(buildOutgoingMessageBody("  hello  ")).toBe("hello");
    });

    it("prepends Zulip-style reply quote with silent mention, link, and quote fence", () => {
      const body = buildOutgoingMessageBody("text", {
        id: 1,
        content: "q",
        sender_full_name: "Alice",
        sender_id: 42,
        permalinkUrl: "https://z.example.com/#narrow/dm/1,2-dm/near/99",
      });
      expect(body).toContain("@_**Alice|42**");
      expect(body).toContain("[wrote](");
      expect(body).toContain("https://z.example.com/#narrow/dm/1,2-dm/near/99");
      expect(body).toContain("```quote");
      expect(body).toContain("q");
      expect(body.endsWith("text")).toBe(true);
    });

    it("omits wrote link when permalink is null", () => {
      const body = buildOutgoingMessageBody("x", {
        id: 1,
        content: "c",
        sender_full_name: "Bob",
        sender_id: 7,
        permalinkUrl: null,
      });
      expect(body).toContain("@_**Bob|7**:");
      expect(body).not.toContain("[wrote]");
      expect(body).toContain("```quote");
    });

    it("keeps multiline content inside the quote fence", () => {
      const body = buildOutgoingMessageBody("reply", {
        id: 1,
        content: "line one\n\nline two",
        sender_full_name: "Bob",
        sender_id: 3,
        permalinkUrl: null,
      });
      expect(body).toContain("```quote\nline one\n\nline two\n```");
      expect(body.endsWith("reply")).toBe(true);
    });
  });

  describe("getAttachmentExtensionLabel", () => {
    it("returns FILE when no extension", () => {
      expect(getAttachmentExtensionLabel("readme")).toBe("FILE");
    });

    it("returns upper extension up to 4 chars", () => {
      expect(getAttachmentExtensionLabel("a.jpeg")).toBe("JPEG");
    });
  });

  describe("formatAttachmentSize", () => {
    it("formats bytes", () => {
      expect(formatAttachmentSize(100)).toBe("100 B");
    });

    it("formats KB", () => {
      expect(formatAttachmentSize(2048)).toBe("2 KB");
    });
  });

  describe("resolveTomorrowMorningTimestamp", () => {
    it("returns a time after the base instant", () => {
      const base = Date.now();
      const ts = resolveTomorrowMorningTimestamp(base);
      expect(ts).toBeGreaterThan(base);
    });
  });

  describe("formatScheduledTimestamp", () => {
    it("returns a non-empty formatted string", () => {
      const s = formatScheduledTimestamp(Date.now());
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(0);
    });
  });
});
