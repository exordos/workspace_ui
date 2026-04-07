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

    it("prepends quote block when replyQuote is set", () => {
      const body = buildOutgoingMessageBody("text", {
        id: 1,
        content: "q",
        sender_full_name: "Alice",
      });
      expect(body).toContain("> **Alice:**");
      expect(body).toContain("q");
      expect(body.endsWith("text")).toBe(true);
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
