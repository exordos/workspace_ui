import { describe, expect, it } from "vitest";
import {
  buildOutgoingMessageBody,
  formatAttachmentSize,
  formatScheduledTimestamp,
  getAttachmentExtensionLabel,
  insertWorkspaceMention,
  isLikelyImageAttachment,
  normalizeImageAttachmentFile,
  resolveTomorrowMorningTimestamp,
} from "./message-composer-body.lib";

describe("message-composer-body.lib", () => {
  describe("buildOutgoingMessageBody", () => {
    it("returns trimmed value without quote", () => {
      expect(buildOutgoingMessageBody("  hello  ")).toBe("hello");
    });

    it("prepends legacy reply quote with silent mention, link, and quote fence", () => {
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

    it("uses longer quote fences when quoted content already contains fences", () => {
      const body = buildOutgoingMessageBody("reply", {
        id: 1,
        content: "@_**Bob|3**:\n```quote\ninner\n```",
        sender_full_name: "Alice",
        sender_id: 42,
        permalinkUrl: null,
      });
      expect(body).toContain("````quote");
      expect(body).toContain("````\n\nreply");
      expect(body).toMatch(/^@_\*\*Alice\|42\*\*:\n````quote\n/s);
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

    it("prepends a Workspace reply quote with canonical user and message URNs", () => {
      const body = buildOutgoingMessageBody("clean reply", {
        id: "55555555-5555-4555-8555-555555555555",
        content: "quoted workspace text",
        sender_full_name: "Bob Reed",
        sender_uuid: "44444444-4444-4444-8444-444444444444",
        permalinkUrl: null,
        quoteFormat: "workspace",
      });

      expect(body).toBe(
        [
          "> [Bob Reed](urn:user:44444444-4444-4444-8444-444444444444) [wrote](urn:message:55555555-5555-4555-8555-555555555555):",
          "> quoted workspace text",
          "",
          "clean reply",
        ].join("\n"),
      );
    });

    it("escapes a Workspace display name inside the mention label", () => {
      const body = buildOutgoingMessageBody("reply", {
        id: "message-uuid",
        content: "quoted",
        sender_full_name: "A]lice * Smith",
        sender_uuid: "user-uuid",
        permalinkUrl: null,
        quoteFormat: "workspace",
      });

      expect(body).toContain("> [A\\]lice \\* Smith](urn:user:user-uuid)");
    });
  });

  describe("insertWorkspaceMention", () => {
    it("replaces the active query and keeps the cursor after the inserted link", () => {
      const result = insertWorkspaceMention("Hi @bo!", 3, 6, "Bob Reed", "user-uuid");

      expect(result.value).toBe("Hi [Bob Reed](urn:user:user-uuid) !");
      expect(result.cursorPosition).toBe("Hi [Bob Reed](urn:user:user-uuid) ".length);
    });

    it("escapes the display name in an ordinary mention", () => {
      const result = insertWorkspaceMention("@a", 0, 2, "A]lice", "user-uuid");

      expect(result.value).toBe("[A\\]lice](urn:user:user-uuid) ");
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

  describe("isLikelyImageAttachment", () => {
    it("returns true when file type is image/*", () => {
      const file = new File(["x"], "photo.png", { type: "image/png" });
      expect(isLikelyImageAttachment(file)).toBe(true);
    });

    it("returns true for empty type with image extension", () => {
      const file = new File(["x"], "image.png", { type: "" });
      expect(isLikelyImageAttachment(file)).toBe(true);
    });

    it("returns false for non-image files", () => {
      const file = new File(["x"], "readme.txt", { type: "text/plain" });
      expect(isLikelyImageAttachment(file)).toBe(false);
    });
  });

  describe("normalizeImageAttachmentFile", () => {
    it("uses fallbackMime when File.type is empty", () => {
      const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "image.png", {
        type: "",
      });
      const normalized = normalizeImageAttachmentFile(file, "image/png");
      expect(normalized.type).toBe("image/png");
      expect(normalized.name).toBe("image.png");
    });

    it("returns the same file when type is already set", () => {
      const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
      expect(normalizeImageAttachmentFile(file, "image/png")).toBe(file);
    });

    it("infers mime from extension when type and fallback are empty", () => {
      const file = new File(["x"], "screenshot.webp", { type: "" });
      const normalized = normalizeImageAttachmentFile(file);
      expect(normalized.type).toBe("image/webp");
    });
  });
});
