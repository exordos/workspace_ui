// Тесты централизованного debounce-синка chat-list snapshot в IndexedDB.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { startChatListSnapshotSync } from "./layout-chat-list-snapshot-sync.lib";

describe("startChatListSnapshotSync", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    useChatListStore.getState().clear();
  });

  it("coalesces frequent tracked changes into one debounced persist call", async () => {
    const persistSnapshot = vi.fn(async () => {});
    const stop = startChatListSnapshotSync({
      instanceId: "inst-1",
      debounceMs: 750,
      persistSnapshot,
    });

    useChatListStore.setState((state) => ({ streamsMap: new Map(state.streamsMap) }));
    useChatListStore.setState((state) => ({ dmsMap: new Map(state.dmsMap) }));
    useChatListStore.setState((state) => ({
      messageIdToLocation: new Map(state.messageIdToLocation),
    }));

    await vi.advanceTimersByTimeAsync(749);
    expect(persistSnapshot).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(persistSnapshot).toHaveBeenCalledTimes(1);

    stop();
  });

  it("flushes pending changes on stop/cleanup", () => {
    const persistSnapshot = vi.fn(async () => {});
    const stop = startChatListSnapshotSync({
      instanceId: "inst-1",
      debounceMs: 750,
      persistSnapshot,
    });

    useChatListStore.setState((state) => ({ streamsMap: new Map(state.streamsMap) }));
    stop();

    expect(persistSnapshot).toHaveBeenCalledTimes(1);
  });

  it("does not persist when only untracked fields changed", async () => {
    const persistSnapshot = vi.fn(async () => {});
    const stop = startChatListSnapshotSync({
      instanceId: "inst-1",
      debounceMs: 750,
      persistSnapshot,
    });

    useChatListStore.setState({
      lastAppliedMessages: [],
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(persistSnapshot).toHaveBeenCalledTimes(0);

    stop();
  });
});
