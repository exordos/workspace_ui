import { describe, expect, it } from "vitest";
import { parseStickerCatalog, searchStickerCatalog } from "./sticker-catalog.lib";
import type { StickerCatalog } from "./sticker.types";

const STICKER_ID = "11111111-1111-4111-8111-111111111111";

function catalogEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: STICKER_ID,
    source: { provider: "giphy", externalId: "abc123" },
    title: "Happy dance",
    alt: "A person celebrates",
    emoji: ["🎉", "🥳"],
    tags: ["celebration", "победа"],
    media: {
      animated: true,
      width: 480,
      height: 270,
      aspectRatio: 1.7778,
      preferredFormat: "webp",
    },
    attribution: {
      provider: "GIPHY",
      creator: "creator",
      pageUrl: "https://giphy.com/gifs/abc123",
    },
    rating: "g",
    active: true,
    blocked: false,
    ...overrides,
  };
}

function catalogWith(entries: readonly Record<string, unknown>[]): StickerCatalog {
  return parseStickerCatalog({
    schemaVersion: 1,
    catalogVersion: "test.1",
    accessMode: "allowlist",
    stickers: entries,
  });
}

describe("parseStickerCatalog", () => {
  it("normalizes the complete metadata schema without media URLs", () => {
    const catalog = catalogWith([
      catalogEntry({ mediaUrl: "https://media.giphy.com/should-not-be-cached.gif" }),
    ]);

    expect(catalog.stickers[0]).toEqual(catalogEntry());
    expect(catalog.stickers[0]).not.toHaveProperty("mediaUrl");
  });

  it("rejects entries without a Workspace UUID", () => {
    expect(() => catalogWith([catalogEntry({ id: "abc123" })])).toThrow(
      "Sticker id must be a Workspace UUID",
    );
  });

  it("normalizes Workspace UUIDs for stable catalog lookup", () => {
    const catalog = catalogWith([catalogEntry({ id: STICKER_ID.toUpperCase() })]);
    expect(catalog.stickers[0]?.id).toBe(STICKER_ID);
  });

  it("rejects duplicate Workspace IDs", () => {
    expect(() => catalogWith([catalogEntry(), catalogEntry()])).toThrow(
      "Sticker catalog contains duplicate Workspace IDs",
    );
  });

  it("rejects media metadata with an unsupported format", () => {
    expect(() =>
      catalogWith([
        catalogEntry({
          media: {
            animated: true,
            width: 480,
            height: 270,
            aspectRatio: 1.7778,
            preferredFormat: "exe",
          },
        }),
      ]),
    ).toThrow("Sticker preferredFormat is invalid");
  });

  it.each(["allowlist", "unrestricted"])("accepts the %s access mode", (accessMode) => {
    expect(
      parseStickerCatalog({
        schemaVersion: 1,
        catalogVersion: "test.1",
        accessMode,
        stickers: [],
      }).accessMode,
    ).toBe(accessMode);
  });

  it("rejects an unknown access mode", () => {
    expect(() =>
      parseStickerCatalog({
        schemaVersion: 1,
        catalogVersion: "test.1",
        accessMode: "everything",
        stickers: [],
      }),
    ).toThrow("Sticker catalog accessMode is invalid");
  });
});

describe("searchStickerCatalog", () => {
  it.each(["happy", "person", "победа", "🥳"])(
    "searches locally across metadata using %s",
    (query) => {
      const catalog = catalogWith([catalogEntry()]);

      expect(searchStickerCatalog(catalog, query)).toHaveLength(1);
    },
  );

  it("does not expose inactive or blocked stickers", () => {
    const catalog = catalogWith([
      catalogEntry({ id: "11111111-1111-4111-8111-111111111111", active: false }),
      catalogEntry({ id: "22222222-2222-4222-8222-222222222222", blocked: true }),
    ]);

    expect(searchStickerCatalog(catalog, "")).toEqual([]);
  });
});
