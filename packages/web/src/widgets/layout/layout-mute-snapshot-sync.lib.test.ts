/**
 * Тесты debounce-sync для mute snapshot.
 * Зачем нужны: фиксируют коалесцирование изменений, flush на cleanup и игнор untracked апдейтов.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { startMuteSnapshotSync } from "./layout-mute-snapshot-sync.lib";

describe("startMuteSnapshotSync", () => {
  // Подготавливает чистый store и фейковые таймеры для проверки debounce-логики.
  beforeEach(() => {
    useMuteStore.getState().clear();
    vi.useFakeTimers();
  });

  // Возвращает окружение таймеров/стора к исходному состоянию.
  afterEach(() => {
    vi.useRealTimers();
    useMuteStore.getState().clear();
  });

  // Проверяет, что серия частых изменений приводит к одной записи после debounce-окна.
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

  // Проверяет, что cleanup не теряет последнее накопленное изменение.
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

  // Проверяет, что отсутствие изменений tracked refs не вызывает запись.
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
