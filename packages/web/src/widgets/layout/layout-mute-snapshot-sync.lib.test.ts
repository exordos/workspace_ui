/**
 * Tests for debounced mute snapshot sync.
 * Covers change coalescing, flush on cleanup, and ignoring untracked updates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { startMuteSnapshotSync } from "./layout-mute-snapshot-sync.lib";

describe("startMuteSnapshotSync", () => {
  // Prepare a clean store and fake timers for debounce logic.
  beforeEach(() => {
    useMuteStore.getState().clear();
    vi.useFakeTimers();
  });

  // Restore timer/store environment after each test.
  afterEach(() => {
    vi.useRealTimers();
    useMuteStore.getState().clear();
  });

  // Assert rapid changes coalesce into one persist call after the debounce window.
  it("coalesces frequent mute changes into one debounced persist call", async () => {
    const persistSnapshotRow = vi.fn(async () => {});
    const stop = startMuteSnapshotSync({
      instanceId: "inst-1",
      debounceMs: 750,
      persistSnapshotRow,
    });

    useMuteStore.getState().muteStream(10);
    useMuteStore.getState().muteTopic(10, "news");
    useMuteStore.getState().unmuteTopic(20, "important");
    useMuteStore.getState().followTopic(20, "incidents");

    await vi.advanceTimersByTimeAsync(749);
    expect(persistSnapshotRow).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(persistSnapshotRow).toHaveBeenCalledTimes(1);
    expect(persistSnapshotRow).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: "inst-1",
        version: 1,
        mutedStreamIds: [10],
        mutedTopics: [{ streamId: 10, topic: "news" }],
        unmutedTopics: [{ streamId: 20, topic: "important" }],
        followedTopics: [{ streamId: 20, topic: "incidents" }],
      }),
    );

    stop();
  });

  // Assert cleanup flushes the last pending change.
  it("flushes pending changes on stop/cleanup", () => {
    const persistSnapshotRow = vi.fn(async () => {});
    const stop = startMuteSnapshotSync({
      instanceId: "inst-1",
      debounceMs: 750,
      persistSnapshotRow,
    });

    useMuteStore.getState().muteStream(42);
    stop();

    expect(persistSnapshotRow).toHaveBeenCalledTimes(1);
  });

  // Assert unchanged tracked refs do not trigger a persist.
  it("does not persist when tracked refs are unchanged", async () => {
    const persistSnapshotRow = vi.fn(async () => {});
    const stop = startMuteSnapshotSync({
      instanceId: "inst-1",
      debounceMs: 750,
      persistSnapshotRow,
    });

    useMuteStore.setState((state) => ({ mutedStreamIds: state.mutedStreamIds }));
    useMuteStore.setState((state) => ({ mutedTopicKeys: state.mutedTopicKeys }));
    useMuteStore.setState((state) => ({ unmutedTopicKeys: state.unmutedTopicKeys }));
    useMuteStore.setState((state) => ({ followedTopicKeys: state.followedTopicKeys }));

    await vi.advanceTimersByTimeAsync(1000);
    expect(persistSnapshotRow).toHaveBeenCalledTimes(0);

    stop();
  });
});
