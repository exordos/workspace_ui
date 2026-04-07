/**
 * Tests for the sticker entity — markdown helpers, parser, and Zustand store.
 *
 * Stickers are sent as special markdown `[sticker:packId:stickerId](url)`.
 * This file verifies the markdown builder/parser round-trip, the
 * isStickerMessage classifier, and the store's pack CRUD, search, recent
 * tracking, favorites, and loading state.
 */
import { afterEach, describe, expect, it } from "vitest";
import { buildStickerMarkdown, parseStickerFromContent, isStickerMessage } from "./sticker.api";
import { useStickerStore } from "./sticker.model";
import type { Sticker, StickerPack } from "./sticker.types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STICKER_1: Sticker = {
  id: "s1",
  packId: "p1",
  emoji: "😀",
  alt: "grinning face",
  format: "webp",
  url: "https://cdn.example.com/stickers/p1/s1.webp",
  thumbnailUrl: "https://cdn.example.com/stickers/p1/s1_thumb.webp",
  width: 512,
  height: 512,
  fileSize: 24000,
};

const STICKER_2: Sticker = {
  id: "s2",
  packId: "p1",
  emoji: "👍",
  format: "png",
  url: "https://cdn.example.com/stickers/p1/s2.png",
  width: 512,
  height: 512,
};

const PACK_1: StickerPack = {
  id: "p1",
  title: "Classic Smileys",
  author: "Workspace",
  animated: false,
  coverStickerId: "s1",
  stickers: [STICKER_1, STICKER_2],
  isDefault: true,
};

// ---------------------------------------------------------------------------
// Markdown helpers — encode/decode stickers into Zulip-compatible markdown.
// ---------------------------------------------------------------------------

// buildStickerMarkdown produces the wire format sent to the Zulip API.
describe("buildStickerMarkdown", () => {
  // Must produce the exact format the parser expects on the receiving end.
  it("builds correct markdown", () => {
    const md = buildStickerMarkdown(STICKER_1);
    expect(md).toBe("[sticker:p1:s1](https://cdn.example.com/stickers/p1/s1.webp)");
  });
});

// parseStickerFromContent extracts sticker metadata from message content.
describe("parseStickerFromContent", () => {
  // Valid sticker markdown must be parsed into packId, stickerId, and URL.
  it("parses valid sticker markdown", () => {
    const result = parseStickerFromContent("[sticker:p1:s1](https://cdn.example.com/s1.webp)");
    expect(result).toEqual({
      packId: "p1",
      stickerId: "s1",
      url: "https://cdn.example.com/s1.webp",
    });
  });

  // Regular text must not be mistakenly parsed as a sticker.
  it("returns null for regular text", () => {
    expect(parseStickerFromContent("Hello world")).toBeNull();
  });

  // Standard image markdown ![alt](url) must not match the sticker pattern.
  it("returns null for regular image markdown", () => {
    expect(parseStickerFromContent("![alt](url.png)")).toBeNull();
  });

  // Sticker embedded within other text must still be extractable.
  it("parses sticker in mixed content", () => {
    const result = parseStickerFromContent("Check this out [sticker:p2:s5](url.webp) nice");
    expect(result?.stickerId).toBe("s5");
  });
});

// isStickerMessage determines if a message should render as a sticker (no text bubble).
describe("isStickerMessage", () => {
  // A message containing ONLY a sticker should render as a full-size sticker image.
  it("returns true for sticker-only content", () => {
    expect(isStickerMessage("[sticker:p1:s1](https://cdn.example.com/s1.webp)")).toBe(true);
  });

  // Leading/trailing whitespace around the sticker must still count as sticker-only.
  it("returns true with whitespace", () => {
    expect(isStickerMessage("  [sticker:p1:s1](url.webp)  ")).toBe(true);
  });

  // Text + sticker must render as a normal text bubble, not a sticker image.
  it("returns false for mixed content", () => {
    expect(isStickerMessage("Hello [sticker:p1:s1](url.webp)")).toBe(false);
  });

  // Plain text messages must not be flagged as stickers.
  it("returns false for regular text", () => {
    expect(isStickerMessage("Just a message")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Store — manages sticker packs, recent usage, favorites, and search.
// ---------------------------------------------------------------------------

// Verifies pack CRUD, sticker search, recent/favorites tracking, and loading state.
describe("useStickerStore", () => {
  afterEach(() => {
    useStickerStore.setState({ packs: [], recent: [], favorites: [], loading: false });
    // eslint-disable-next-line no-restricted-properties -- test teardown, no credentials stored
    localStorage.clear();
  });

  // Initial state must be empty — packs are loaded asynchronously.
  it("starts with empty packs", () => {
    expect(useStickerStore.getState().packs).toHaveLength(0);
  });

  // setPacks is the bulk load — replaces everything after API fetch.
  it("setPacks replaces all packs", () => {
    useStickerStore.getState().setPacks([PACK_1]);
    expect(useStickerStore.getState().packs).toHaveLength(1);
    expect(useStickerStore.getState().packs[0]!.title).toBe("Classic Smileys");
  });

  // addPack allows installing individual packs incrementally.
  it("addPack adds a new pack", () => {
    useStickerStore.getState().addPack(PACK_1);
    expect(useStickerStore.getState().packs).toHaveLength(1);
  });

  // Duplicate packs (same ID) must be silently ignored to avoid duplicates in UI.
  it("addPack ignores duplicate", () => {
    useStickerStore.getState().addPack(PACK_1);
    useStickerStore.getState().addPack(PACK_1);
    expect(useStickerStore.getState().packs).toHaveLength(1);
  });

  // Pack removal (uninstall) must clean up by pack ID.
  it("removePack removes by id", () => {
    useStickerStore.getState().addPack(PACK_1);
    useStickerStore.getState().removePack("p1");
    expect(useStickerStore.getState().packs).toHaveLength(0);
  });

  // getSticker searches all packs — used to resolve sticker from message content.
  it("getSticker finds sticker across packs", () => {
    useStickerStore.getState().setPacks([PACK_1]);
    const found = useStickerStore.getState().getSticker("s2");
    expect(found?.emoji).toBe("👍");
  });

  // Unknown sticker ID returns undefined — callers show a placeholder.
  it("getSticker returns undefined for unknown id", () => {
    expect(useStickerStore.getState().getSticker("unknown")).toBeUndefined();
  });

  it("getPack finds pack by id", () => {
    useStickerStore.getState().setPacks([PACK_1]);
    expect(useStickerStore.getState().getPack("p1")?.title).toBe("Classic Smileys");
  });

  // Emoji search powers the sticker picker's search bar.
  it("searchByEmoji finds matching stickers", () => {
    useStickerStore.getState().setPacks([PACK_1]);
    const results = useStickerStore.getState().searchByEmoji("👍");
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("s2");
  });

  // Alt text search allows finding stickers by description (e.g. "grinning").
  it("searchByEmoji by alt text", () => {
    useStickerStore.getState().setPacks([PACK_1]);
    const results = useStickerStore.getState().searchByEmoji("grinning");
    expect(results).toHaveLength(1);
  });

  // Recent tracking provides quick access to recently sent stickers.
  it("addRecent tracks usage", () => {
    useStickerStore.getState().setPacks([PACK_1]);
    useStickerStore.getState().addRecent("s1", "p1");
    expect(useStickerStore.getState().recent).toHaveLength(1);
    expect(useStickerStore.getState().recent[0]!.stickerId).toBe("s1");
  });

  // Sending the same sticker twice must not create duplicate entries.
  it("addRecent deduplicates", () => {
    useStickerStore.getState().addRecent("s1", "p1");
    useStickerStore.getState().addRecent("s1", "p1");
    expect(useStickerStore.getState().recent).toHaveLength(1);
  });

  // Most recently used sticker must appear first in the recents list.
  it("addRecent puts newest first", () => {
    useStickerStore.getState().addRecent("s1", "p1");
    useStickerStore.getState().addRecent("s2", "p1");
    expect(useStickerStore.getState().recent[0]!.stickerId).toBe("s2");
  });

  // Toggle favorite must work as a flip — add on first call, remove on second.
  it("toggleFavorite adds and removes", () => {
    useStickerStore.getState().toggleFavorite("s1");
    expect(useStickerStore.getState().isFavorite("s1")).toBe(true);

    useStickerStore.getState().toggleFavorite("s1");
    expect(useStickerStore.getState().isFavorite("s1")).toBe(false);
  });

  // getRecentStickers must resolve IDs to full Sticker objects for rendering.
  it("getRecentStickers resolves sticker objects", () => {
    useStickerStore.getState().setPacks([PACK_1]);
    useStickerStore.getState().addRecent("s1", "p1");
    const recent = useStickerStore.getState().getRecentStickers();
    expect(recent).toHaveLength(1);
    expect(recent[0]!.emoji).toBe("😀");
  });

  // getFavoriteStickers must resolve favorite IDs to full Sticker objects.
  it("getFavoriteStickers resolves sticker objects", () => {
    useStickerStore.getState().setPacks([PACK_1]);
    useStickerStore.getState().toggleFavorite("s1");
    const favs = useStickerStore.getState().getFavoriteStickers();
    expect(favs).toHaveLength(1);
    expect(favs[0]!.id).toBe("s1");
  });

  // Removing a pack must also clean up its recent entries to avoid dangling references.
  it("removePack also removes recent entries for that pack", () => {
    useStickerStore.getState().addRecent("s1", "p1");
    useStickerStore.getState().removePack("p1");
    expect(useStickerStore.getState().recent).toHaveLength(0);
  });

  // Loading state is used by the UI to show a spinner during pack fetch.
  it("loading state toggles", () => {
    expect(useStickerStore.getState().loading).toBe(false);
    useStickerStore.getState().setLoading(true);
    expect(useStickerStore.getState().loading).toBe(true);
  });
});
