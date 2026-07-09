import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { ensureMentionsUnreadSynced } from "./chat-list-mentions-sync.lib";

function setActiveInstance(instanceId: string): void {
  useInstancesStore.setState({
    instances: [],
    currentInstanceId: instanceId,
    unreadCountsByInstance: {},
    jitsiMeetBaseUrl: null,
  });
}

describe("ensureMentionsUnreadSynced", () => {
  beforeEach(() => {
    useChatListStore.getState().clear();
    useChatListStore.setState({ currentUserId: 7 });
  });

  afterEach(() => {
    useChatListStore.getState().clear();
    useInstancesStore.setState({
      instances: [],
      currentInstanceId: null,
      unreadCountsByInstance: {},
      jitsiMeetBaseUrl: null,
    });
  });

  it("keeps local mention state unchanged without legacy API sync", async () => {
    useChatListStore.setState({
      mentionsUnreadApiSynced: false,
      mentionsUnreadCount: 2,
      mentionedUnreadMessageIds: new Set([1, 2]),
    });
    setActiveInstance("inst-1");

    await ensureMentionsUnreadSynced({
      currentInstanceId: "inst-1",
      currentUserId: 7,
      forceRefresh: true,
    });

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(2);
    expect(useChatListStore.getState().mentionsUnreadApiSynced).toBe(false);
    expect([...useChatListStore.getState().mentionedUnreadMessageIds]).toEqual([1, 2]);
  });

  it("is safe when there is no active instance", async () => {
    await ensureMentionsUnreadSynced({
      currentInstanceId: null,
      currentUserId: 7,
    });

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(0);
    expect(useChatListStore.getState().mentionsUnreadApiSynced).toBe(false);
  });
});
