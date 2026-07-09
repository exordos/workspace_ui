import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureRealmEmojisLoaded,
  getCachedRealmEmojis,
  resetRealmEmojisCacheForTests,
} from "./realm-emojis-cache";

describe("realm-emojis-cache", () => {
  beforeEach(() => {
    resetRealmEmojisCacheForTests();
  });

  it("returns an empty no-op cache without loading legacy custom emojis", async () => {
    expect(getCachedRealmEmojis()).toEqual([]);

    await expect(ensureRealmEmojisLoaded()).resolves.toEqual([]);
    expect(getCachedRealmEmojis()).toEqual([]);
  });
});
