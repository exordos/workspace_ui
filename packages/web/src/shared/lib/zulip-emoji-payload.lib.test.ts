import { SkinTones, type EmojiClickData } from "emoji-picker-react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  resetZulipEmojiCatalogForTests,
  setZulipEmojiCatalogForTests,
} from "./zulip-emoji-catalog.lib";
import { zulipEmojiPayloadFromPickerData } from "./zulip-emoji-payload.lib";

function emojiClickData(overrides: Partial<EmojiClickData>): EmojiClickData {
  return {
    activeSkinTone: SkinTones.NEUTRAL,
    unified: "",
    unifiedWithoutSkinTone: "",
    emoji: "",
    names: [],
    imageUrl: "",
    getImageUrl: () => "",
    isCustom: false,
    ...overrides,
  };
}

describe("zulipEmojiPayloadFromPickerData", () => {
  beforeEach(() => {
    resetZulipEmojiCatalogForTests();
  });

  it("maps unicode emoji through server catalog instead of picker name", () => {
    setZulipEmojiCatalogForTests({
      code_to_names: {
        "1f603": ["smiley"],
      },
    });

    expect(
      zulipEmojiPayloadFromPickerData(
        emojiClickData({
          unified: "1f603",
          unifiedWithoutSkinTone: "1f603",
          emoji: "😃",
          names: ["grinning face"],
        }),
        { mode: "strict" },
      ),
    ).toEqual({
      emojiName: "smiley",
      emojiCode: "1f603",
      reactionType: "unicode_emoji",
    });
  });

  it("prefers data.unified before unifiedWithoutSkinTone", () => {
    setZulipEmojiCatalogForTests({
      code_to_names: {
        "1f44d-1f3fb": ["thumbs_up_light_skin_tone"],
        "1f44d": ["thumbs_up"],
      },
    });

    expect(
      zulipEmojiPayloadFromPickerData(
        emojiClickData({
          unified: "1f44d-1f3fb",
          unifiedWithoutSkinTone: "1f44d",
          emoji: "👍🏻",
          names: ["thumbs up"],
        }),
        { mode: "strict" },
      ),
    ).toEqual({
      emojiName: "thumbs_up_light_skin_tone",
      emojiCode: "1f44d-1f3fb",
      reactionType: "unicode_emoji",
    });
  });

  it("maps realm custom emoji payload with id and imageUrl", () => {
    expect(
      zulipEmojiPayloadFromPickerData(
        emojiClickData({
          unified: "42",
          unifiedWithoutSkinTone: "42",
          emoji: "42",
          names: ["party_parrot"],
          imageUrl: "https://cdn.example.com/party_parrot.png",
          isCustom: true,
        }),
        { mode: "strict" },
      ),
    ).toEqual({
      emojiName: "party_parrot",
      emojiCode: "42",
      reactionType: "realm_emoji",
      imageUrl: "https://cdn.example.com/party_parrot.png",
    });
  });

  it("returns null for unknown unicode emoji in strict mode", () => {
    expect(
      zulipEmojiPayloadFromPickerData(
        emojiClickData({
          unified: "1f9ea",
          unifiedWithoutSkinTone: "1f9ea",
          emoji: "🧪",
          names: ["test tube"],
        }),
        { mode: "strict" },
      ),
    ).toBeNull();
  });

  it("returns null for broken custom emoji data", () => {
    expect(
      zulipEmojiPayloadFromPickerData(
        emojiClickData({
          isCustom: true,
          names: [],
          unified: "",
          unifiedWithoutSkinTone: "",
          emoji: "",
        }),
        { mode: "strict" },
      ),
    ).toBeNull();
  });
});
