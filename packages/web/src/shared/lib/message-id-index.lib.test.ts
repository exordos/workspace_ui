import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  buildMessageIdMap,
  createMessageIdSet,
  filterViewportUnreadIdsForReadDispatch,
  messageIdsMissingFromBothLists,
} from "./message-id-index.lib";

const MESSAGE_ID_1 = testMessageId(1);
const MESSAGE_ID_2 = testMessageId(2);
const MESSAGE_ID_3 = testMessageId(3);
const MESSAGE_ID_4 = testMessageId(4);
const MESSAGE_ID_5 = testMessageId(5);
const MESSAGE_ID_10 = testMessageId(10);
const MESSAGE_ID_11 = testMessageId(11);
const MESSAGE_ID_12 = testMessageId(12);
const MESSAGE_ID_99 = testMessageId(99);

describe("message-id-index", () => {
  it("buildMessageIdMap returns O(1) lookup", () => {
    const map = buildMessageIdMap([
      { id: MESSAGE_ID_1, read: true },
      { id: MESSAGE_ID_2, read: false },
    ]);
    expect(map.get(MESSAGE_ID_2)?.read).toBe(false);
    expect(map.get(MESSAGE_ID_99)).toBeUndefined();
  });

  it("createMessageIdSet collects ids", () => {
    const set = createMessageIdSet([{ id: MESSAGE_ID_3 }, { id: MESSAGE_ID_4 }]);
    expect(set.has(MESSAGE_ID_3)).toBe(true);
    expect(set.has(MESSAGE_ID_5)).toBe(false);
  });

  it("filterViewportUnreadIdsForReadDispatch skips read and own messages", () => {
    const byId = buildMessageIdMap([
      { id: MESSAGE_ID_10, read: false, sender_id: 2 },
      { id: MESSAGE_ID_11, read: true, sender_id: 2 },
      { id: MESSAGE_ID_12, read: false, sender_id: 1 },
    ]);
    expect(
      filterViewportUnreadIdsForReadDispatch(
        new Set([MESSAGE_ID_10, MESSAGE_ID_11, MESSAGE_ID_12, MESSAGE_ID_99]),
        byId,
        1,
      ),
    ).toEqual([MESSAGE_ID_10]);
  });

  it("messageIdsMissingFromBothLists finds ids in neither set", () => {
    const store = createMessageIdSet([{ id: MESSAGE_ID_1 }]);
    const effective = createMessageIdSet([{ id: MESSAGE_ID_2 }]);
    expect(
      messageIdsMissingFromBothLists([MESSAGE_ID_1, MESSAGE_ID_2, MESSAGE_ID_3], store, effective),
    ).toEqual([MESSAGE_ID_3]);
  });
});
