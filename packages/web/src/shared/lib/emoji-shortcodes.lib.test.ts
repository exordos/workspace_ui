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

  it("resolves fallback zulip aliases from emoji-picker list", () => {
    expect(resolveShortcodeToUnicode("grinning_face_with_smiling_eyes")).toBe("😄");
    expect(resolveShortcodeToUnicode("rolling_on_the_floor_laughing")).toBe("🤣");
    expect(resolveShortcodeToUnicode("slight_smile")).toBe("🙂");
    expect(resolveShortcodeToUnicode("upside_down")).toBe("🙃");
    expect(resolveShortcodeToUnicode("smiling_face_with_hearts")).toBe("🥰");
    expect(resolveShortcodeToUnicode("heart_kiss")).toBe("😘");
    expect(resolveShortcodeToUnicode("kiss_with_blush")).toBe("😚");
    expect(resolveShortcodeToUnicode("kiss_smiling_eyes")).toBe("😙");
    expect(resolveShortcodeToUnicode("money_face")).toBe("🤑");
    expect(resolveShortcodeToUnicode("stuck_out_tongue_wink")).toBe("😜");
    expect(resolveShortcodeToUnicode("face_with_open_eyes_and_hand_over_mouth")).toBe("🫢");
    expect(resolveShortcodeToUnicode("silence")).toBe("🤐");
    expect(resolveShortcodeToUnicode("speechless")).toBe("😶");
    expect(resolveShortcodeToUnicode("face_in_clouds")).toBe("😶‍🌫");
    expect(resolveShortcodeToUnicode("face_exhaling")).toBe("😮‍💨");
    expect(resolveShortcodeToUnicode("sick")).toBe("🤒");
    expect(resolveShortcodeToUnicode("hurt")).toBe("🤕");
    expect(resolveShortcodeToUnicode("oh_no")).toBe("😕");
    expect(resolveShortcodeToUnicode("frown")).toBe("🙁");
    expect(resolveShortcodeToUnicode("sad")).toBe("☹");
    expect(resolveShortcodeToUnicode("fear")).toBe("😨");
    expect(resolveShortcodeToUnicode("exhausted")).toBe("😥");
    expect(resolveShortcodeToUnicode("anguish")).toBe("😫");
    expect(resolveShortcodeToUnicode("smiling_devil")).toBe("😈");
    expect(resolveShortcodeToUnicode("devil")).toBe("👿");
    expect(resolveShortcodeToUnicode("angry_cat")).toBe("😾");
    expect(resolveShortcodeToUnicode("heart_pulse")).toBe("💗");
    expect(resolveShortcodeToUnicode("heart_box")).toBe("💟");
    expect(resolveShortcodeToUnicode("lipstick_kiss")).toBe("💋");
    expect(resolveShortcodeToUnicode("seeing_stars")).toBe("💫");
    expect(resolveShortcodeToUnicode("face_with_spiral_eyes")).toBe("😵‍💫");
    expect(resolveShortcodeToUnicode("umm")).toBe("💬");
    expect(resolveShortcodeToUnicode("speech_bubble")).toBe("🗨");
    expect(resolveShortcodeToUnicode("anger_bubble")).toBe("🗯");
    expect(resolveShortcodeToUnicode("thought")).toBe("💭");
  });
});
