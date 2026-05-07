import { describe, expect, it } from "vitest";
import {
  normalizeEmojiShortcodeName,
  resolveShortcodeToUnicode,
  resolveUnicodeToCanonicalShortcode,
} from "./emoji-shortcodes.lib";

function emojiToNormalizedCodePointSequence(value: string): string {
  const normalized = value.normalize("NFC");
  return Array.from(normalized)
    .map((char) => char.codePointAt(0))
    .filter((codePoint): codePoint is number => codePoint != null && codePoint !== 0xfe0f)
    .map((codePoint) => codePoint.toString(16))
    .join("-");
}

function expectEmojiSemanticEqual(actual: string | null, expected: string): void {
  expect(actual).not.toBeNull();
  expect(emojiToNormalizedCodePointSequence(actual ?? "")).toBe(
    emojiToNormalizedCodePointSequence(expected),
  );
}

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
    expectEmojiSemanticEqual(resolveShortcodeToUnicode(":ok:"), "👌");
  });

  it("resolves canonical shortcode from unicode with zulip-first override", () => {
    expect(resolveUnicodeToCanonicalShortcode("1f6e0-fe0f")).toBe("working_on_it");
    expect(resolveUnicodeToCanonicalShortcode("1f44d")).toBe("thumbs_up");
    expect(resolveUnicodeToCanonicalShortcode("1f62e")).toBe("open_mouth");
  });

  it("resolves fallback zulip aliases from emoji-picker list", () => {
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("grinning_face_with_smiling_eyes"), "😄");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("rolling_on_the_floor_laughing"), "🤣");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("slight_smile"), "🙂");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("upside_down"), "🙃");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("smiling_face_with_hearts"), "🥰");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("heart_kiss"), "😘");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("kiss_with_blush"), "😚");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("kiss_smiling_eyes"), "😙");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("money_face"), "🤑");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("stuck_out_tongue_wink"), "😜");
    expectEmojiSemanticEqual(
      resolveShortcodeToUnicode("face_with_open_eyes_and_hand_over_mouth"),
      "🫢",
    );
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("silence"), "🤐");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("speechless"), "😶");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("face_in_clouds"), "😶‍🌫");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("face_exhaling"), "😮‍💨");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("sick"), "🤒");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("hurt"), "🤕");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("oh_no"), "😕");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("frown"), "🙁");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("sad"), "☹");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("fear"), "😨");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("exhausted"), "😥");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("anguish"), "😫");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("smiling_devil"), "😈");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("devil"), "👿");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("angry_cat"), "😾");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("heart_pulse"), "💗");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("heart_box"), "💟");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("lipstick_kiss"), "💋");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("seeing_stars"), "💫");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("face_with_spiral_eyes"), "😵‍💫");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("umm"), "💬");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("speech_bubble"), "🗨");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("anger_bubble"), "🗯");
    expectEmojiSemanticEqual(resolveShortcodeToUnicode("thought"), "💭");
  });
});
