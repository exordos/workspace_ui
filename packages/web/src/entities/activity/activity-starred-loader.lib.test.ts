// Tests for shared starred loader.
// Asserts that the loader:
// 1) synchronously updates starred list and summary;
// 2) deduplicates parallel identical loads.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
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
    // Isolate store state and mocks between tests.
    useActivityStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
    fetchActivityMessagesPageWithPersist.mockReset();
    hydrateActivityMessagesFromCache.mockReset();
    hydrateActivityMessagesFromCache.mockResolvedValue([]);
  });

  afterEach(() => {
    useActivityStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
  });

  it("refreshes starred filter and summary from server", async () => {
    // Assert basic happy path: cache-first + server refresh.
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
    expect(fetchActivityMessagesPageWithPersist).toHaveBeenCalledWith(
      "starred",
      7,
      "newest",
      200,
      { signal: undefined },
    );
  });

  it("dedupes parallel starred loads by request key", async () => {
    // Assert parallel calls do not trigger duplicate network requests.
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

  it("does not apply stale starred refresh after organization switch", async () => {
    let resolveOldFetch!: (value: {
      messages: ReturnType<typeof createMessage>[];
      foundOldest: boolean;
    }) => void;
    const oldFetch = new Promise<{ messages: ReturnType<typeof createMessage>[]; foundOldest: boolean }>(
      (resolve) => {
        resolveOldFetch = resolve;
      },
    );

    let resolveNewFetch!: (value: {
      messages: ReturnType<typeof createMessage>[];
      foundOldest: boolean;
    }) => void;
    const newFetch = new Promise<{ messages: ReturnType<typeof createMessage>[]; foundOldest: boolean }>(
      (resolve) => {
        resolveNewFetch = resolve;
      },
    );

    fetchActivityMessagesPageWithPersist.mockReturnValueOnce(oldFetch).mockReturnValueOnce(newFetch);

    useInstancesStore.setState({
      instances: [
        {
          id: "instance-1",
          realm: "https://one.example.com",
          email: "one@example.com",
          apiKey: "api-key",
        },
        {
          id: "instance-2",
          realm: "https://two.example.com",
          email: "two@example.com",
          apiKey: "api-key",
        },
      ],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });

    const first = ensureStarredLoaded({
      currentInstanceId: "instance-1",
      currentUserId: 7,
      pageSize: 200,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchActivityMessagesPageWithPersist).toHaveBeenCalledTimes(1);

    useInstancesStore.getState().setCurrentInstanceId("instance-2");
    useActivityStore.getState().clear();

    const second = ensureStarredLoaded({
      currentInstanceId: "instance-2",
      currentUserId: 7,
      pageSize: 200,
    });

    resolveOldFetch({
      messages: [
        createMessage({
          id: 44,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "bugs",
          content: "old org starred",
          timestamp: 44,
          type: "stream",
          display_recipient: "engineering",
          flags: ["starred"],
        }),
      ],
      foundOldest: true,
    });

    await first;
    expect(useActivityStore.getState().filters.starred.messages).toEqual([]);

    resolveNewFetch({
      messages: [
        createMessage({
          id: 55,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "bugs",
          content: "new org starred",
          timestamp: 55,
          type: "stream",
          display_recipient: "engineering",
          flags: ["starred"],
        }),
      ],
      foundOldest: true,
    });

    await second;
    expect(useActivityStore.getState().filters.starred.messages.map((message) => message.id)).toEqual(
      [55],
    );
  });
});
