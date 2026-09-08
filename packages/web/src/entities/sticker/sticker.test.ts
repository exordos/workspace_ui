import { describe, expect, it } from "vitest";
import {
  buildStickerMarkdown,
  buildStickerReferenceUrn,
  buildStickerUrn,
  isStickerMessage,
  parseStickerFromContent,
  parseStickerUrn,
} from "./sticker.api";
import type { Sticker } from "./sticker.types";

const STICKER_1_ID = "11111111-1111-4111-8111-111111111111";
const STICKER_1_URN = `urn:sticker:${STICKER_1_ID}`;
const STICKER_1_MARKDOWN = `![sticker](${STICKER_1_URN})`;
const GIPHY_ID = "xT4uQulxzV39haRFjG";
const GIPHY_URN = `urn:sticker:giphy:${GIPHY_ID}`;
const GIPHY_MARKDOWN = `![sticker](${GIPHY_URN})`;

const STICKER_1: Sticker = {
  id: STICKER_1_ID,
  reference: { kind: "workspace", stickerId: STICKER_1_ID },
  source: { provider: "giphy", externalId: "giphy-1" },
  title: "Grinning celebration",
  emoji: ["😀"],
  tags: ["happy", "celebration"],
  alt: "grinning face",
  format: "webp",
  url: "https://cdn.example.com/stickers/p1/s1.webp",
  thumbnailUrl: "https://cdn.example.com/stickers/p1/s1_thumb.webp",
  media: {
    animated: true,
    width: 512,
    height: 512,
    aspectRatio: 1,
    preferredFormat: "webp",
  },
  attribution: { provider: "GIPHY" },
  rating: "g",
  active: true,
  blocked: false,
  fileSize: 24000,
};

describe("sticker URN", () => {
  it("builds a provider-neutral URN from a Workspace UUID", () => {
    expect(buildStickerUrn(STICKER_1_ID)).toBe(STICKER_1_URN);
    expect(buildStickerUrn(STICKER_1_ID.toUpperCase())).toBe(STICKER_1_URN);
  });

  it("parses Workspace and temporary frontend-only GIPHY references", () => {
    expect(parseStickerUrn(STICKER_1_URN)).toEqual({
      kind: "workspace",
      stickerId: STICKER_1_ID,
    });
    expect(parseStickerUrn(STICKER_1_URN.toUpperCase())).toEqual({
      kind: "workspace",
      stickerId: STICKER_1_ID,
    });
    expect(parseStickerUrn(GIPHY_URN)).toEqual({
      kind: "provider",
      provider: "giphy",
      externalId: GIPHY_ID,
    });
    expect(parseStickerUrn(`${STICKER_1_URN}?fallback=giphy`)).toBeNull();
  });

  it("builds a temporary GIPHY URN for unrestricted frontend mode", () => {
    expect(
      buildStickerReferenceUrn({ kind: "provider", provider: "giphy", externalId: GIPHY_ID }),
    ).toBe(GIPHY_URN);
  });

  it("rejects a non-UUID sticker ID", () => {
    expect(() => buildStickerUrn("giphy-id")).toThrow("Workspace UUID");
  });
});

describe("buildStickerMarkdown", () => {
  it("keeps provider IDs and media URLs out of the wire format", () => {
    expect(buildStickerMarkdown(STICKER_1)).toBe(STICKER_1_MARKDOWN);
  });

  it("includes the provider ID only for an unrestricted provider reference", () => {
    expect(
      buildStickerMarkdown({
        reference: { kind: "provider", provider: "giphy", externalId: GIPHY_ID },
      }),
    ).toBe(GIPHY_MARKDOWN);
  });
});

describe("parseStickerFromContent", () => {
  it("parses valid sticker markdown", () => {
    expect(parseStickerFromContent(STICKER_1_MARKDOWN)).toEqual({
      kind: "workspace",
      stickerId: STICKER_1_ID,
    });
  });

  it("parses unrestricted GIPHY sticker markdown", () => {
    expect(parseStickerFromContent(GIPHY_MARKDOWN)).toEqual({
      kind: "provider",
      provider: "giphy",
      externalId: GIPHY_ID,
    });
  });

  it("returns null for regular text", () => {
    expect(parseStickerFromContent("Hello world")).toBeNull();
  });

  it("returns null for regular image markdown", () => {
    expect(parseStickerFromContent("![alt](url.png)")).toBeNull();
  });

  it("does not classify mixed content as a sticker message", () => {
    expect(parseStickerFromContent(`Check this out ${STICKER_1_MARKDOWN}`)).toBeNull();
  });
});

describe("isStickerMessage", () => {
  it("returns true for sticker-only content", () => {
    expect(isStickerMessage(STICKER_1_MARKDOWN)).toBe(true);
  });

  it("returns true with whitespace", () => {
    expect(isStickerMessage(`  ${STICKER_1_MARKDOWN}  `)).toBe(true);
  });

  it("returns false for mixed content", () => {
    expect(isStickerMessage(`Hello ${STICKER_1_MARKDOWN}`)).toBe(false);
  });

  it("returns false for regular text", () => {
    expect(isStickerMessage("Just a message")).toBe(false);
  });
});
