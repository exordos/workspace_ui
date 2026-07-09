import { afterEach, describe, expect, it } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import { createUser } from "~/test/factories";
import { useChatInfoStore } from "./chat-info.model";
import type { ChatInfoContext } from "./chat-info.types";

function streamContext(
  streamId: number,
  name: string,
  overrides?: Partial<Extract<ChatInfoContext, { kind: "stream" }>>,
): Extract<ChatInfoContext, { kind: "stream" }> {
  return {
    kind: "stream",
    instanceId: "inst-a",
    streamId,
    streamName: name,
    isMuted: false,
    topics: [],
    ...overrides,
  };
}

describe("chat-info model orchestration", () => {
  afterEach(() => {
    useChatInfoStore.getState().clear();
    useUsersStore.getState().clear();
  });

  it("hydrates stream info from local context without legacy stream members", async () => {
    await useChatInfoStore.getState().hydrate(
      streamContext(10, "engineering", {
        topics: [{ name: "release", unreadCount: 3 }],
      }),
    );

    const state = useChatInfoStore.getState();
    expect(state.data).toMatchObject({
      type: "stream",
      name: "engineering",
      memberCount: 0,
      onlineCount: 0,
      members: [],
      description: null,
      topics: [{ name: "release", unreadCount: 3 }],
    });
    expect(state.streamMemberIds).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("syncDerived updates stream mute and topics using already local data", async () => {
    const context = streamContext(10, "engineering");
    await useChatInfoStore.getState().hydrate(context);

    useChatInfoStore.getState().syncDerived({
      ...context,
      isMuted: true,
      topics: [{ name: "infra", unreadCount: 1 }],
    });

    const state = useChatInfoStore.getState();
    expect(state.data?.type).toBe("stream");
    expect(state.data?.isMuted).toBe(true);
    expect(state.data?.topics).toEqual([{ name: "infra", unreadCount: 1 }]);
    expect(state.streamMemberIds).toEqual([]);
  });

  it("hydrates dm members from users store", async () => {
    useUsersStore.getState().upsertUser(
      createUser({
        user_id: 1,
        displayName: "Alice Workspace",
        status: "active",
      }),
    );

    await useChatInfoStore.getState().hydrate({
      kind: "dm",
      instanceId: "inst-a",
      dmName: "Team DM",
      participantIds: [1, 1, 2],
    });

    const state = useChatInfoStore.getState();
    expect(state.data?.type).toBe("dm");
    expect(state.data?.memberCount).toBe(2);
    expect(state.data?.onlineCount).toBe(1);
    expect(state.data?.members).toEqual([
      expect.objectContaining({
        userId: 1,
        fullName: "Alice Workspace",
        isOnline: true,
      }),
    ]);
  });

  it("invalidating active stream rehydrates the same local context", async () => {
    const context = streamContext(42, "engineering", {
      topics: [{ name: "release", unreadCount: 1 }],
    });
    await useChatInfoStore.getState().hydrate(context);

    useChatInfoStore.getState().invalidateStream("inst-a", 42);
    await Promise.resolve();
    await Promise.resolve();

    const state = useChatInfoStore.getState();
    expect(state.context).toEqual(context);
    expect(state.data?.type).toBe("stream");
    expect(state.data?.name).toBe("engineering");
    expect(state.streamMemberIds).toEqual([]);
  });
});
