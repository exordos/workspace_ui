import { describe, expect, it } from "vitest";
import {
  invalidateInstance,
  invalidateStream,
  loadStreamMembers,
  loadStreamMetadata,
  resetChatInfoApiCacheForTests,
} from "./chat-info.api";

describe("chat-info.api", () => {
  it("returns local-only empty stream members for legacy numeric context", async () => {
    await expect(loadStreamMembers("inst-a", 10)).resolves.toEqual([]);
  });

  it("returns no stream metadata without calling legacy Zulip streams API", async () => {
    await expect(loadStreamMetadata("inst-a", 10)).resolves.toEqual({
      name: null,
      description: null,
    });
  });

  it("keeps invalidation helpers as no-ops for compatibility", () => {
    expect(() => invalidateStream("inst-a", 10)).not.toThrow();
    expect(() => invalidateInstance("inst-a")).not.toThrow();
    expect(() => resetChatInfoApiCacheForTests()).not.toThrow();
  });
});
