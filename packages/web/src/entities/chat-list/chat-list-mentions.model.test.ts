import { afterEach, describe, expect, it } from "vitest";
import { useChatListStore } from "./chat-list.model";

const CURRENT_USER_ID = 10;
const OTHER_SENDER_ID = 20;

function mentionMsg(id: number, flags: string[] = ["mentioned"], senderId = OTHER_SENDER_ID) {
  return {
    id,
    sender_id: senderId,
    sender_full_name: "Peer",
    content: `@user ${id}`,
    timestamp: id,
    type: "stream" as const,
    stream_id: 5,
    display_recipient: "general",
    subject: "topic",
    flags,
  };
}

describe("chat-list mentions counter", () => {
  afterEach(() => {
    useChatListStore.getState().clear();
  });

  it("addMessage increments mentionsUnreadCount for unread mention from others", () => {
    useChatListStore.setState({ currentUserId: CURRENT_USER_ID });
    useChatListStore.getState().addMessage(mentionMsg(100));

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(1);
    expect([...useChatListStore.getState().mentionedUnreadMessageIds]).toEqual([100]);
  });

  it("addMessage dedupes mention increment by message id", () => {
    useChatListStore.setState({ currentUserId: CURRENT_USER_ID });
    const msg = mentionMsg(100);
    useChatListStore.getState().addMessage(msg);
    useChatListStore.getState().addMessage(msg);

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(1);
  });

  it("addMessage ignores self-mentions and read mentions", () => {
    useChatListStore.setState({ currentUserId: CURRENT_USER_ID });
    useChatListStore.getState().addMessage(mentionMsg(1, ["mentioned"], CURRENT_USER_ID));
    useChatListStore.getState().addMessage(mentionMsg(2, ["mentioned", "read"]));

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(0);
  });

  it("reconcileMentionsFromServer replaces set and count authoritatively", () => {
    useChatListStore.setState({
      currentUserId: CURRENT_USER_ID,
      mentionedUnreadMessageIds: new Set([1, 2, 3]),
      mentionsUnreadCount: 3,
    });

    useChatListStore
      .getState()
      .reconcileMentionsFromServer(
        [mentionMsg(5, ["mentioned"]), mentionMsg(6, ["mentioned"], CURRENT_USER_ID)],
        { capped: true },
      );

    const state = useChatListStore.getState();
    expect(state.mentionsUnreadCount).toBe(1);
    expect([...state.mentionedUnreadMessageIds]).toEqual([5]);
    expect(state.mentionsUnreadCapped).toBe(true);
    expect(state.mentionsUnreadApiSynced).toBe(true);
  });

  it("reconcileMentionsFromRegisterIds applies register fallback until API sync", () => {
    useChatListStore.getState().reconcileMentionsFromRegisterIds([7, 8]);
    expect(useChatListStore.getState().mentionsUnreadCount).toBe(2);

    useChatListStore.setState({ mentionsUnreadApiSynced: true });
    useChatListStore.getState().reconcileMentionsFromRegisterIds([9]);
    expect(useChatListStore.getState().mentionsUnreadCount).toBe(2);
  });

  it("reconcileUnreadFromSnapshot uses register mentions before API sync", () => {
    useChatListStore.getState().reconcileUnreadFromSnapshot(
      {
        totalCount: 0,
        streams: [],
        dms: [],
        mentionMessageIds: [11, 12],
      },
      CURRENT_USER_ID,
    );

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(2);
    expect(useChatListStore.getState().mentionsUnreadApiSynced).toBe(false);
  });

  it("decrementMentionsForReadMessages removes ids from set", () => {
    useChatListStore.setState({
      mentionedUnreadMessageIds: new Set([1, 2]),
      mentionsUnreadCount: 2,
    });
    useChatListStore.getState().decrementMentionsForReadMessages([1]);

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(1);
    expect([...useChatListStore.getState().mentionedUnreadMessageIds]).toEqual([2]);
  });

  it("streams() exposes hasMention on stream and topic rows with indexed locations", () => {
    useChatListStore.setState({
      currentUserId: CURRENT_USER_ID,
      mentionedUnreadMessageIds: new Set([100]),
      messageIdToLocation: new Map([[100, { type: "stream", stream_id: 5, topic: "topic" }]]),
      streamsMap: new Map([
        [
          5,
          {
            stream_id: 5,
            name: "general",
            lastMessage: "hi",
            time: "",
            ts: 1,
            topics: new Map([
              [
                "topic",
                {
                  subject: "topic",
                  lastMessage: "hi",
                  time: "",
                  ts: 1,
                  unreadCount: 0,
                },
              ],
            ]),
          },
        ],
      ]),
    });

    const stream = useChatListStore.getState().streams()[0];
    expect(stream?.hasMention).toBe(true);
    expect(stream?.topics?.[0]?.hasMention).toBe(true);
  });

  it("dms() omits hasMention on personal 1:1 rows", () => {
    useChatListStore.setState({
      currentUserId: CURRENT_USER_ID,
      mentionedUnreadMessageIds: new Set([200]),
      messageIdToLocation: new Map([[200, { type: "dm", dmKey: "10,20" }]]),
      dmsMap: new Map([
        [
          "10,20",
          {
            id: 20,
            name: "Peer",
            slug: "20-peer",
            isGroup: false,
            lastMessage: "hey",
            time: "",
            ts: 1,
            unreadCount: 0,
            userIds: [10, 20],
          },
        ],
      ]),
    });

    expect(useChatListStore.getState().dms()[0]?.hasMention).toBeUndefined();
  });
});
