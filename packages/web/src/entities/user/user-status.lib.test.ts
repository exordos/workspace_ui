import { describe, expect, it } from "vitest";
import {
  encodeEmojiToCode,
  formatUserStatusLabel,
  getUserStatusEmoji,
  normalizeStatusEmojiName,
} from "./user-status.lib";

describe("user-status.lib", () => {
  it("formats emoji and text when unicode emoji code exists", () => {
    const label = formatUserStatusLabel({
      text: "Working remotely",
      emojiCode: "1f3e0",
      away: false,
    });

    expect(label).toBe("🏠 Working remotely");
  });

  it("decodes combined unicode codepoints", () => {
    const emoji = getUserStatusEmoji({
      text: "",
      emojiCode: "1f1fa-1f1e6",
      away: false,
    });

    expect(emoji).toBe("🇺🇦");
  });

  it("uses emoji-name fallback when emoji code is absent", () => {
    const label = formatUserStatusLabel({
      text: "Lunch",
      emojiName: "plate_with_cutlery",
      away: false,
    });

    expect(label).toBe("🍽️ Lunch");
  });

  it("returns null for empty status payload", () => {
    const label = formatUserStatusLabel({
      text: "   ",
      away: false,
    });

    expect(label).toBeNull();
  });

  it("encodes emoji to unicode codepoints", () => {
    expect(encodeEmojiToCode("🧪")).toBe("1f9ea");
    expect(encodeEmojiToCode("🍽️")).toBe("1f37d-fe0f");
  });

  it("normalizes status emoji names from picker data", () => {
    expect(normalizeStatusEmojiName(" Test Tube ")).toBe("test_tube");
    expect(normalizeStatusEmojiName(":thumbs-up:")).toBe("thumbs_up");
  });
});
