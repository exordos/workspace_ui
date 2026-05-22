import { describe, expect, it } from "vitest";
import {
  buildMessageIdMap,
  createMessageIdSet,
  filterViewportUnreadIdsForReadDispatch,
  messageIdsMissingFromBothLists,
} from "./message-id-index.lib";

describe("message-id-index", () => {
  it("buildMessageIdMap returns O(1) lookup", () => {
    const map = buildMessageIdMap([
      { id: 1, flags: ["read"] },
      { id: 2, flags: [] },
    ]);
    expect(map.get(2)?.flags).toEqual([]);
    expect(map.get(99)).toBeUndefined();
  });

  it("createMessageIdSet collects ids", () => {
    const set = createMessageIdSet([{ id: 3 }, { id: 4 }]);
    expect(set.has(3)).toBe(true);
    expect(set.has(5)).toBe(false);
  });

  it("filterViewportUnreadIdsForReadDispatch skips read and own messages", () => {
    const byId = buildMessageIdMap([
      { id: 10, flags: [], sender_id: 2 },
      { id: 11, flags: ["read"], sender_id: 2 },
      { id: 12, flags: [], sender_id: 1 },
    ]);
    expect(filterViewportUnreadIdsForReadDispatch(new Set([10, 11, 12, 99]), byId, 1)).toEqual([
      10,
    ]);
  });

  it("messageIdsMissingFromBothLists finds ids in neither set", () => {
    const store = createMessageIdSet([{ id: 1 }]);
    const effective = createMessageIdSet([{ id: 2 }]);
    expect(messageIdsMissingFromBothLists([1, 2, 3], store, effective)).toEqual([3]);
  });
});
