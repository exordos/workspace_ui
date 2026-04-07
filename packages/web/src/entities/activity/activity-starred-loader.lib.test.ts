// Тесты общего starred-loader.
// Проверяют, что loader:
// 1) синхронно обновляет список starred и summary;
// 2) дедуплицирует параллельные одинаковые загрузки.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { createMessage } from "~/test/factories";
import { ensureStarredLoaded } from "./activity-starred-loader.lib";

const fetchActivityMessagesPageWithPersist = vi.hoisted(() => vi.fn());
const hydrateActivityMessagesFromCache = vi.hoisted(() => vi.fn());

vi.mock("~/entities/activity/activity.api", () => ({
  fetchActivityMessagesPageWithPersist,
}));

vi.mock("~/entities/activity/activity-cache.lib", () => {
  return {
    hydrateActivityMessagesFromCache,
    isActivityMessagesSnapshotFresher: () => true,
  };
});

describe("ensureStarredLoaded", () => {
  beforeEach(() => {
    // Изоляция состояния стора и моков между тестами.
    useActivityStore.getState().clear();
    fetchActivityMessagesPageWithPersist.mockReset();
    hydrateActivityMessagesFromCache.mockReset();
    hydrateActivityMessagesFromCache.mockResolvedValue([]);
  });

  afterEach(() => {
    useActivityStore.getState().clear();
  });

  it("refreshes starred filter and summary from server", async () => {
    // Проверяем базовый happy-path: cache-first + server refresh.
    const cached = [
      createMessage({
        id: 10,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "cached starred",
        timestamp: 10,
        type: "stream",
        display_recipient: "engineering",
        flags: ["starred"],
      }),
    ];
    const server = [
      createMessage({
        id: 22,
        sender_id: 42,
        sender_full_name: "Alice",
        stream_id: 10,
        subject: "bugs",
        content: "server starred",
        timestamp: 22,
        type: "stream",
        display_recipient: "engineering",
        flags: ["starred"],
      }),
    ];
    hydrateActivityMessagesFromCache.mockResolvedValue(cached);
    fetchActivityMessagesPageWithPersist.mockResolvedValue({
      messages: server,
      foundOldest: false,
    });

    await ensureStarredLoaded({
      currentInstanceId: "instance-1",
      currentUserId: 7,
      pageSize: 200,
    });

    const state = useActivityStore.getState();
    expect(state.filters.starred.messages.map((m) => m.id)).toEqual([22]);
    expect(state.starredSummary.count).toBe(1);
    expect(state.starredSummary.isCapped).toBe(true);
    expect(fetchActivityMessagesPageWithPersist).toHaveBeenCalledWith("starred", 7, "newest", 200);
  });

  it("dedupes parallel starred loads by request key", async () => {
    // Проверяем, что параллельные вызовы не делают двойной сетевой запрос.
    interface FetchResult {
      messages: ReturnType<typeof createMessage>[];
      foundOldest: boolean;
    }
    let resolveFetch!: (value: FetchResult) => void;
    const fetchPromise = new Promise<FetchResult>((resolve) => {
      resolveFetch = resolve;
    });
    fetchActivityMessagesPageWithPersist.mockReturnValue(fetchPromise);

    const first = ensureStarredLoaded({
      currentInstanceId: "instance-1",
      currentUserId: 7,
      pageSize: 200,
    });
    const second = ensureStarredLoaded({
      currentInstanceId: "instance-1",
      currentUserId: 7,
      pageSize: 200,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchActivityMessagesPageWithPersist).toHaveBeenCalledTimes(1);

    resolveFetch({
      messages: [
        createMessage({
          id: 33,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "bugs",
          content: "deduped starred",
          timestamp: 33,
          type: "stream",
          display_recipient: "engineering",
          flags: ["starred"],
        }),
      ],
      foundOldest: true,
    });

    await Promise.all([first, second]);
    expect(useActivityStore.getState().starredSummary.count).toBe(1);
  });
});
