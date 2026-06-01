import { describe, expect, it } from "vitest";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";
import { streamTopicCompositeKey } from "./chat-list-stream-topic-index.lib";
import {
  applyReconcileUnreadMapsPatch,
  groupStreamTopicUnreadPatches,
  parseStreamTopicCompositeKey,
} from "./chat-list-unread-reconcile-apply.lib";
import type { ChatListState } from "./chat-list.model.types";

function emptyChatListState(overrides: Partial<ChatListState> = {}): ChatListState {
  return {
    streamsMap: new Map(),
    dmsMap: new Map(),
    sidebarDataHydrated: false,
    streamMetadataHydrated: false,
    currentUserId: 10,
    lastAppliedMessages: null,
    messageIdToLocation: new Map(),
    streamTopicMessageIds: new Map(),
    sidebarStreamsUnread: 0,
    sidebarDmsUnread: 0,
    mentionsUnreadCount: 0,
    ...overrides,
  } as ChatListState;
}

describe("chat-list-unread-reconcile-apply", () => {
  it("parseStreamTopicCompositeKey splits stream id and topic", () => {
    expect(parseStreamTopicCompositeKey("5\tgeneral")).toEqual({
      streamId: 5,
      topicKey: "general",
    });
    expect(parseStreamTopicCompositeKey("bad")).toBeNull();
  });

  it("groupStreamTopicUnreadPatches skips unchanged counts", () => {
    const topics = new Map([
      [
        "general",
        {
          subject: "general",
          lastMessage: "hi",
          time: "1",
          ts: 1,
          unreadCount: 2,
        },
      ],
    ]);
    const streamsMap = new Map<number, StreamEntryInternal>([
      [
        1,
        {
          stream_id: 1,
          name: "stream",
          lastMessage: "hi",
          time: "1",
          ts: 1,
          topics,
        },
      ],
    ]);
    const key = streamTopicCompositeKey(1, "general");
    const patches = groupStreamTopicUnreadPatches(streamsMap, [key], new Map([[key, 2]]));
    expect(patches.size).toBe(0);
    const patchesChanged = groupStreamTopicUnreadPatches(streamsMap, [key], new Map([[key, 0]]));
    expect(patchesChanged.get(1)).toEqual([{ topicKey: "general", unreadCount: 0 }]);
  });

  it("applyReconcileUnreadMapsPatch resets stale local unread to server zero", () => {
    const topics = new Map([
      [
        "general",
        {
          subject: "general",
          lastMessage: "hi",
          time: "1",
          ts: 1,
          unreadCount: 3,
        },
      ],
    ]);
    const state = emptyChatListState({
      streamsMap: new Map([
        [
          1,
          {
            stream_id: 1,
            name: "stream",
            lastMessage: "hi",
            time: "1",
            ts: 1,
            topics,
          },
        ],
      ]),
      sidebarStreamsUnread: 3,
    });
    const key = streamTopicCompositeKey(1, "general");
    const patch = applyReconcileUnreadMapsPatch(state, {
      unreadStreamCounts: new Map([[key, 0]]),
      unreadDmCounts: new Map(),
      unreadLocationMap: new Map(),
      latestUnreadStreams: new Map(),
      latestUnreadDms: new Map(),
      effectiveUserId: 10,
      avatarMap: new Map(),
    });
    expect(patch).not.toBe(state);
    if (patch === state) return;
    expect(patch.streamsMap?.get(1)?.topics.get("general")?.unreadCount).toBe(0);
    expect(patch.sidebarStreamsUnread).toBe(0);
  });
});
