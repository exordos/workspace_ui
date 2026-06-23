import { afterEach, describe, expect, it } from "vitest";
import { testMessageId, testMessageOrdinal } from "~/test/factories";
import { useChatListStore } from "./chat-list.model";

const CURRENT_USER_ID = 10;
const OTHER_SENDER_ID = 20;
const STREAM_UUID = "00000000-0000-4000-8000-000000000005";

function mentionMsg(id: number | string, flags: string[] = ["mentioned"]) {
  return {
    id: testMessageId(id),
    sender_id: OTHER_SENDER_ID,
    sender_full_name: "Peer",
    content: `@user ${id}`,
    timestamp: testMessageOrdinal(id),
    type: "stream" as const,
    stream_uuid: STREAM_UUID,
    display_recipient: "general",
    subject: "topic",
    flags,
  };
}

describe("chat-list mentions counter", () => {
  afterEach(() => {
    useChatListStore.getState().clear();
  });

  it("keeps server-backed mention counters empty until the backend exposes them", () => {
    useChatListStore.setState({ currentUserId: CURRENT_USER_ID });
    useChatListStore.getState().addMessage(mentionMsg(100));

    expect(useChatListStore.getState().mentionsUnreadCount).toBe(0);
    expect([...useChatListStore.getState().mentionedUnreadMessageIds]).toEqual([]);
  });

  it("streams() exposes hasMention on stream and topic rows with indexed locations", () => {
    useChatListStore.setState({
      currentUserId: CURRENT_USER_ID,
      mentionedUnreadMessageIds: new Set([testMessageId(100)]),
      messageIdToLocation: new Map([
        [testMessageId(100), { type: "stream", streamUuid: STREAM_UUID, topic: "topic" }],
      ]),
      streamsMap: new Map([
        [
          STREAM_UUID,
          {
            streamUuid: STREAM_UUID,
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
      mentionedUnreadMessageIds: new Set([testMessageId(200)]),
      messageIdToLocation: new Map([[testMessageId(200), { type: "dm", dmKey: "10,20" }]]),
      dmsMap: new Map([
        [
          "10,20",
          {
            id: 20,
            name: "Peer",
            slug: "20-peer",
            lastMessage: "hey",
            time: "",
            ts: 1,
            unreadCount: 0,
          },
        ],
      ]),
    });

    const dm = useChatListStore.getState().dms()[0];
    expect(dm?.hasMention).toBeUndefined();
  });
});
