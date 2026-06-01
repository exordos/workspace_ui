import { describe, expect, it } from "vitest";
import {
  AVATAR_BLOB_CACHE_MAX_ENTRIES,
  AVATAR_BLOB_CACHE_MAX_TOTAL_BYTES,
  buildAvatarBlobCacheKey,
  isAvatarBlobCacheEntrySizeAllowed,
  isAvatarBlobCacheVersionValid,
  pickAvatarBlobEvictionIds,
  shouldBypassAvatarBlobCache,
} from "~/shared/lib/avatar-blob-cache.lib";

describe("buildAvatarBlobCacheKey", () => {
  it("strips _av from absolute URLs", () => {
    expect(buildAvatarBlobCacheKey("https://z.example.com/avatar/1.png?_av=3&size=64")).toBe(
      "/avatar/1.png?size=64",
    );
  });

  it("strips _av from relative paths", () => {
    expect(buildAvatarBlobCacheKey("/avatar/42.png?_av=2")).toBe("/avatar/42.png");
  });

  it("returns pathname-only key when only _av was present", () => {
    expect(buildAvatarBlobCacheKey("https://cdn.test/u.png?_av=1")).toBe("/u.png");
  });

  it("returns null for blob and data URLs", () => {
    expect(buildAvatarBlobCacheKey("blob:http://localhost/x")).toBeNull();
    expect(buildAvatarBlobCacheKey("data:image/png;base64,AA")).toBeNull();
  });
});

describe("shouldBypassAvatarBlobCache", () => {
  it("bypasses blob, data, and empty", () => {
    expect(shouldBypassAvatarBlobCache("blob:x")).toBe(true);
    expect(shouldBypassAvatarBlobCache("data:x")).toBe(true);
    expect(shouldBypassAvatarBlobCache("")).toBe(true);
    expect(shouldBypassAvatarBlobCache(undefined)).toBe(true);
  });

  it("does not bypass https avatar URLs", () => {
    expect(shouldBypassAvatarBlobCache("https://z.example.com/avatar/1.png")).toBe(false);
  });
});

describe("isAvatarBlobCacheEntrySizeAllowed", () => {
  it("rejects zero and oversized entries", () => {
    expect(isAvatarBlobCacheEntrySizeAllowed(0)).toBe(false);
    expect(isAvatarBlobCacheEntrySizeAllowed(512 * 1024 + 1)).toBe(false);
    expect(isAvatarBlobCacheEntrySizeAllowed(1024)).toBe(true);
  });
});

describe("isAvatarBlobCacheVersionValid", () => {
  it("requires exact version match", () => {
    expect(isAvatarBlobCacheVersionValid(2, 2)).toBe(true);
    expect(isAvatarBlobCacheVersionValid(2, 3)).toBe(false);
  });
});

describe("pickAvatarBlobEvictionIds", () => {
  const row = (id: string, byteSize: number, lastAccessedAt: number) => ({
    id,
    byteSize,
    lastAccessedAt,
  });

  it("evicts oldest rows when total bytes exceed cap", () => {
    const ids = pickAvatarBlobEvictionIds(
      [
        row("a", 10 * 1024 * 1024, 100),
        row("b", 10 * 1024 * 1024, 200),
        row("c", 10 * 1024 * 1024, 300),
      ],
      { incomingBytes: 8 * 1024 * 1024, maxTotalBytes: AVATAR_BLOB_CACHE_MAX_TOTAL_BYTES },
    );
    expect(ids).toEqual(["a", "b"]);
  });

  it("evicts oldest when entry count exceeds cap", () => {
    const rows = Array.from({ length: AVATAR_BLOB_CACHE_MAX_ENTRIES }, (_, i) =>
      row(`id-${i}`, 100, i),
    );
    const ids = pickAvatarBlobEvictionIds(rows, {
      incomingBytes: 100,
      maxEntries: AVATAR_BLOB_CACHE_MAX_ENTRIES,
    });
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids[0]).toBe("id-0");
  });

  it("returns empty when within limits", () => {
    expect(pickAvatarBlobEvictionIds([row("a", 1000, 1)], { incomingBytes: 2000 })).toEqual([]);
  });
});
