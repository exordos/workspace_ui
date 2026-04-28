import { SkinTones } from "emoji-picker-react";
import { describe, expect, it } from "vitest";
import type { Reaction } from "~/shared/api/zulip.types";
import {
  getReactionDisplayChar,
  isOneToOneDirectMessage,
  reactionPayloadFromEmojiClickData,
  resolveEmojiShortcodeDisplayGlyph,
} from "./message-bubble-emoji.lib";

function normalizeEmojiPresentation(emoji: string): string {
  return emoji.normalize("NFC").replace(/\uFE0F/gu, "");
}

describe("isOneToOneDirectMessage", () => {
  it("returns false for stream messages", () => {
    expect(
      isOneToOneDirectMessage({
        id: 1,
        sender_id: 1,
        sender_full_name: "A",
        stream_id: 5,
        subject: "topic",
        content: "",
        timestamp: 0,
        display_recipient: "stream",
      }),
    ).toBe(false);
  });

  it("returns true when private and exactly two recipients", () => {
    expect(
      isOneToOneDirectMessage({
        id: 1,
        sender_id: 1,
        sender_full_name: "A",
        stream_id: null,
        subject: "",
        content: "",
        timestamp: 0,
        display_recipient: [
          { id: 1, full_name: "A" },
          { id: 2, full_name: "B" },
        ],
      }),
    ).toBe(true);
  });

  it("returns false for group DM (three or more recipients)", () => {
    expect(
      isOneToOneDirectMessage({
        id: 1,
        sender_id: 1,
        sender_full_name: "A",
        stream_id: null,
        subject: "",
        content: "",
        timestamp: 0,
        display_recipient: [
          { id: 1, full_name: "A" },
          { id: 2, full_name: "B" },
          { id: 3, full_name: "C" },
        ],
      }),
    ).toBe(false);
  });

  it("returns false when display_recipient is missing or not an array", () => {
    expect(
      isOneToOneDirectMessage({
        id: 1,
        sender_id: 1,
        sender_full_name: "A",
        stream_id: null,
        subject: "",
        content: "",
        timestamp: 0,
      }),
    ).toBe(false);
  });
});

describe("reactionPayloadFromEmojiClickData", () => {
  it("maps unicode emoji click payload", () => {
    const payload = reactionPayloadFromEmojiClickData({
      activeSkinTone: SkinTones.NEUTRAL,
      unified: "1f44d",
      unifiedWithoutSkinTone: "1f44d",
      emoji: "👍",
      names: ["thumbs_up"],
      imageUrl: "https://example.com/thumbs_up.png",
      getImageUrl: () => "https://example.com/thumbs_up.png",
      isCustom: false,
    });
    expect(payload).toEqual({
      emojiName: "thumbs_up",
      reactionType: "unicode_emoji",
      emojiCode: "1f44d",
    });
  });

  it("derives canonical zulip shortcode from unified unicode, not picker keywords", () => {
    const payload = reactionPayloadFromEmojiClickData({
      activeSkinTone: SkinTones.NEUTRAL,
      unified: "1f6e0-fe0f",
      unifiedWithoutSkinTone: "1f6e0-fe0f",
      emoji: "🛠️",
      names: ["tool", "hammer", "wrench"],
      imageUrl: "https://example.com/hammer_and_wrench.png",
      getImageUrl: () => "https://example.com/hammer_and_wrench.png",
      isCustom: false,
    });
    expect(payload).toEqual({
      emojiName: "working_on_it",
      reactionType: "unicode_emoji",
      emojiCode: "1f6e0-fe0f",
    });
  });

  it("maps custom emoji click payload", () => {
    const payload = reactionPayloadFromEmojiClickData({
      activeSkinTone: SkinTones.NEUTRAL,
      unified: "43",
      unifiedWithoutSkinTone: "43",
      emoji: "43",
      names: ["party_node"],
      imageUrl: "https://cdn.example.com/party_node.png",
      getImageUrl: () => "https://cdn.example.com/party_node.png",
      isCustom: true,
    });
    expect(payload).toEqual({
      emojiName: "party_node",
      reactionType: "realm_emoji",
      emojiCode: "43",
      imageUrl: "https://cdn.example.com/party_node.png",
    });
  });
});

describe("resolveEmojiShortcodeDisplayGlyph", () => {
  it("prefers shared resolver for known shortcode aliases", () => {
    expect(normalizeEmojiPresentation(resolveEmojiShortcodeDisplayGlyph("working_on_it"))).toBe(
      normalizeEmojiPresentation("🛠️"),
    );
  });

  it("resolves aliases via shared resolver", () => {
    expect(resolveEmojiShortcodeDisplayGlyph(":+1:")).toBe("👍");
  });

  it("returns raw shortcode name when no resolver or fallback match exists", () => {
    expect(resolveEmojiShortcodeDisplayGlyph("some unknown emoji")).toBe("some unknown emoji");
  });
});

describe("getReactionDisplayChar", () => {
  it("prefers emoji_code for unicode reactions", () => {
    const reaction: Reaction = {
      emoji_name: "heart",
      emoji_code: "1f44d",
      reaction_type: "unicode_emoji",
      user_id: 1,
    };
    expect(getReactionDisplayChar(reaction)).toBe("👍");
  });

  it("falls back to shortcode resolver when unicode emoji_code is invalid", () => {
    const reaction: Reaction = {
      emoji_name: "working_on_it",
      emoji_code: "not-a-code",
      reaction_type: "unicode_emoji",
      user_id: 1,
    };
    expect(normalizeEmojiPresentation(getReactionDisplayChar(reaction))).toBe(
      normalizeEmojiPresentation("🛠️"),
    );
  });

  it("falls back to raw emoji_name when no resolver can map it", () => {
    const reaction: Reaction = {
      emoji_name: "unknown-reaction",
      emoji_code: "",
      reaction_type: "realm_emoji",
      user_id: 1,
    };
    expect(getReactionDisplayChar(reaction)).toBe("unknown-reaction");
  });
});
