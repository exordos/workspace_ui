import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStreamMembers, fetchStreams } from "~/shared/api/zulip-streams";
import {
  invalidateStream,
  loadStreamMembers,
  loadStreamMetadata,
  loadStreamsSnapshot,
  resetChatInfoApiCacheForTests,
} from "./chat-info.api";

vi.mock("~/shared/api/zulip-streams", () => ({
  fetchStreamMembers: vi.fn(),
  fetchStreams: vi.fn(),
}));

describe("chat-info.api", () => {
  afterEach(() => {
    resetChatInfoApiCacheForTests();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("deduplicates in-flight member requests for the same stream", async () => {
    vi.mocked(fetchStreamMembers).mockResolvedValue([1, 2, 3]);

    const [left, right] = await Promise.all([
      loadStreamMembers("inst-a", 10),
      loadStreamMembers("inst-a", 10),
    ]);

    expect(left).toEqual([1, 2, 3]);
    expect(right).toEqual([1, 2, 3]);
    expect(fetchStreamMembers).toHaveBeenCalledTimes(1);
  });

  it("reuses members cache until TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T09:00:00.000Z"));
    vi.mocked(fetchStreamMembers).mockResolvedValue([11, 12]);

    await loadStreamMembers("inst-a", 77);
    await loadStreamMembers("inst-a", 77);

    expect(fetchStreamMembers).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-03-26T09:01:01.000Z"));
    await loadStreamMembers("inst-a", 77);

    expect(fetchStreamMembers).toHaveBeenCalledTimes(2);
  });

  it("isolates streams snapshot cache by instance id", async () => {
    vi.mocked(fetchStreams)
      .mockResolvedValueOnce([
        { stream_id: 1, name: "eng", description: "A", is_announcement_only: false },
      ])
      .mockResolvedValueOnce([
        { stream_id: 2, name: "design", description: "B", is_announcement_only: false },
      ]);

    const a1 = await loadStreamsSnapshot("inst-a");
    const a2 = await loadStreamsSnapshot("inst-a");
    const b1 = await loadStreamsSnapshot("inst-b");

    expect(a1[0]?.stream_id).toBe(1);
    expect(a2[0]?.stream_id).toBe(1);
    expect(b1[0]?.stream_id).toBe(2);
    expect(fetchStreams).toHaveBeenCalledTimes(2);
  });

  it("loads metadata from cached streams snapshot and invalidates on demand", async () => {
    vi.mocked(fetchStreams)
      .mockResolvedValueOnce([
        { stream_id: 10, name: "eng", description: "First", is_announcement_only: false },
      ])
      .mockResolvedValueOnce([
        { stream_id: 10, name: "eng", description: "Second", is_announcement_only: false },
      ]);

    const first = await loadStreamMetadata("inst-a", 10);
    const second = await loadStreamMetadata("inst-a", 10);
    invalidateStream("inst-a", 10);
    const third = await loadStreamMetadata("inst-a", 10);

    expect(first.description).toBe("First");
    expect(second.description).toBe("First");
    expect(third.description).toBe("Second");
    expect(fetchStreams).toHaveBeenCalledTimes(2);
  });
});
