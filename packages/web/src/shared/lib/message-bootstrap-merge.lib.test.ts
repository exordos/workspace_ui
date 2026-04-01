import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import {
  computeHasMoreNewerAfterIdbDeltaFetch,
  filterDeltaMessagesNotInCache,
  mergeCachedMessagesWithDelta,
} from "./message-bootstrap-merge.lib";

function msg(id: number, content = ""): MockMessage {
  return {
    id,
    sender_id: 1,
    sender_full_name: "u",
    stream_id: null,
    subject: "",
    content,
    timestamp: id,
  };
}

describe("mergeCachedMessagesWithDelta", () => {
  it("returns sorted union without duplicates", () => {
    const a = mergeCachedMessagesWithDelta([msg(1), msg(3)], [msg(2), msg(4)]);
    expect(a.map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });

  it("delta overwrites same id", () => {
    const merged = mergeCachedMessagesWithDelta([msg(1, "old")], [msg(1, "new")]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.content).toBe("new");
  });

  it("empty delta returns cached order", () => {
    const c = [msg(10), msg(20)];
    expect(mergeCachedMessagesWithDelta(c, [])).toEqual(c);
  });

  it("empty cache returns delta sorted", () => {
    expect(mergeCachedMessagesWithDelta([], [msg(5), msg(2)]).map((m) => m.id)).toEqual([2, 5]);
  });
});

describe("filterDeltaMessagesNotInCache", () => {
  it("drops ids present in set", () => {
    const s = new Set([1, 2]);
    expect(filterDeltaMessagesNotInCache(s, [msg(2), msg(3)]).map((m) => m.id)).toEqual([3]);
  });
});

describe("computeHasMoreNewerAfterIdbDeltaFetch", () => {
  it("false when foundNewest", () => {
    expect(
      computeHasMoreNewerAfterIdbDeltaFetch({
        foundNewest: true,
        deltaReturnedCount: 200,
        numAfterRequested: 200,
      }),
    ).toBe(false);
  });

  it("false when partial page", () => {
    expect(
      computeHasMoreNewerAfterIdbDeltaFetch({
        foundNewest: false,
        deltaReturnedCount: 10,
        numAfterRequested: 200,
      }),
    ).toBe(false);
  });

  it("true when full page and not foundNewest", () => {
    expect(
      computeHasMoreNewerAfterIdbDeltaFetch({
        foundNewest: false,
        deltaReturnedCount: 200,
        numAfterRequested: 200,
      }),
    ).toBe(true);
  });
});
