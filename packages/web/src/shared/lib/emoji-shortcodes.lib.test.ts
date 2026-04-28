import { describe, expect, it } from "vitest";
import {
  normalizeEmojiShortcodeName,
  resolveShortcodeToUnicode,
  resolveUnicodeToCanonicalShortcode,
} from "./emoji-shortcodes.lib";

describe("emoji-shortcodes.lib", () => {
  it("normalizes shortcode aliases from mixed formats", () => {
    expect(normalizeEmojiShortcodeName("  :Thumbs-Up:  ")).toBe("thumbs_up");
    expect(normalizeEmojiShortcodeName(" working on it ")).toBe("working_on_it");
    expect(normalizeEmojiShortcodeName(":+1:")).toBe("+1");
  });

  it("resolves zulip alias to the same unicode as emojibase alias", () => {
    expect(resolveShortcodeToUnicode("working_on_it")).toBe(
      resolveShortcodeToUnicode("hammer_and_wrench"),
    );
    expect(resolveShortcodeToUnicode(":working_on_it:")).not.toBeNull();
  });

  it("resolves canonical shortcode from unicode with zulip-first override", () => {
    expect(resolveUnicodeToCanonicalShortcode("1f6e0-fe0f")).toBe("working_on_it");
    expect(resolveUnicodeToCanonicalShortcode("1f44d")).toBe("thumbs_up");
    expect(resolveUnicodeToCanonicalShortcode("1f62e")).toBe("open_mouth");
  });
});
