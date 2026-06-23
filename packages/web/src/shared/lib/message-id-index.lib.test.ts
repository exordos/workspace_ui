import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  buildMessageIdMap,
  createMessageIdSet,
  messageIdsMissingFromBothLists,
} from "./message-id-index.lib";

const MESSAGE_ID_1 = testMessageId(1);
const MESSAGE_ID_2 = testMessageId(2);
const MESSAGE_ID_3 = testMessageId(3);
const MESSAGE_ID_4 = testMessageId(4);
const MESSAGE_ID_5 = testMessageId(5);
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

  it("messageIdsMissingFromBothLists finds ids in neither set", () => {
    const store = createMessageIdSet([{ id: MESSAGE_ID_1 }]);
    const effective = createMessageIdSet([{ id: MESSAGE_ID_2 }]);
    expect(
      messageIdsMissingFromBothLists([MESSAGE_ID_1, MESSAGE_ID_2, MESSAGE_ID_3], store, effective),
    ).toEqual([MESSAGE_ID_3]);
  });
});
