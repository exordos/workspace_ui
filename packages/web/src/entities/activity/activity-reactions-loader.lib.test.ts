import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityStore } from "~/entities/activity/activity.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { createMessage } from "~/test/factories";
import { ensureReactionsLoaded } from "./activity-reactions-loader.lib";

const loadLegacyActivityEmptyPage = vi.hoisted(() => vi.fn());
const hydrateActivityMessagesFromCache = vi.hoisted(() => vi.fn());

vi.mock("~/entities/activity/activity.api", () => ({
  loadLegacyActivityEmptyPage,
}));

vi.mock("~/entities/activity/activity-cache.lib", () => ({
  hydrateActivityMessagesFromCache,
  isActivityMessagesSnapshotFresher: () => true,
}));

describe("ensureReactionsLoaded", () => {
  beforeEach(() => {
    useActivityStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });
    loadLegacyActivityEmptyPage.mockReset();
    hydrateActivityMessagesFromCache.mockReset();
    hydrateActivityMessagesFromCache.mockResolvedValue([]);
  });

  it("does not apply stale reactions refresh after organization switch", async () => {
    let resolveOldFetch!: (value: {
      messages: ReturnType<typeof createMessage>[];
      foundOldest: boolean;
    }) => void;
    const oldFetch = new Promise<{
      messages: ReturnType<typeof createMessage>[];
      foundOldest: boolean;
    }>((resolve) => {
      resolveOldFetch = resolve;
    });

    let resolveNewFetch!: (value: {
      messages: ReturnType<typeof createMessage>[];
      foundOldest: boolean;
    }) => void;
    const newFetch = new Promise<{
      messages: ReturnType<typeof createMessage>[];
      foundOldest: boolean;
    }>((resolve) => {
      resolveNewFetch = resolve;
    });

    loadLegacyActivityEmptyPage.mockReturnValueOnce(oldFetch).mockReturnValueOnce(newFetch);

    useInstancesStore.setState({
      instances: [{ id: "instance-1" }, { id: "instance-2" }],
      currentInstanceId: "instance-1",
      unreadCountsByInstance: {},
      activeOrgEpoch: 0,
    });

    const first = ensureReactionsLoaded({
      currentInstanceId: "instance-1",
      currentUserId: 7,
      pageSize: 200,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(loadLegacyActivityEmptyPage).toHaveBeenCalledTimes(1);

    useInstancesStore.getState().setCurrentInstanceId("instance-2");
    useActivityStore.getState().clear();

    const second = ensureReactionsLoaded({
      currentInstanceId: "instance-2",
      currentUserId: 7,
      pageSize: 200,
    });

    resolveOldFetch({
      messages: [
        createMessage({
          id: 66,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "bugs",
          content: "old org reaction",
          timestamp: 66,
          type: "stream",
          display_recipient: "engineering",
        }),
      ],
      foundOldest: true,
    });

    await first;
    expect(useActivityStore.getState().filters.reactions.messages).toEqual([]);

    resolveNewFetch({
      messages: [
        createMessage({
          id: 77,
          sender_id: 42,
          sender_full_name: "Alice",
          stream_id: 10,
          subject: "bugs",
          content: "new org reaction",
          timestamp: 77,
          type: "stream",
          display_recipient: "engineering",
        }),
      ],
      foundOldest: true,
    });

    await second;
    expect(
      useActivityStore.getState().filters.reactions.messages.map((message) => message.id),
    ).toEqual([77]);
  });
});
