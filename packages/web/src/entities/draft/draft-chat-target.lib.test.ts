import { describe, expect, it } from "vitest";
import { resolveDraftTargetIds } from "./draft-chat-target.lib";

describe("resolveDraftTargetIds", () => {
  it("returns dm user ids in dm view", () => {
    expect(
      resolveDraftTargetIds({
        isDmView: true,
        activeDmUserIds: [7, 42],
        activeStreamId: null,
        fallbackStreamId: 10,
      }),
    ).toEqual([7, 42]);
  });

  it("prioritizes stream id from route for stream chats", () => {
    expect(
      resolveDraftTargetIds({
        isDmView: false,
        activeDmUserIds: null,
        activeStreamId: 7,
        fallbackStreamId: 1,
      }),
    ).toEqual([7]);
  });

  it("falls back to context stream id when route stream id is missing", () => {
    expect(
      resolveDraftTargetIds({
        isDmView: false,
        activeDmUserIds: null,
        activeStreamId: null,
        fallbackStreamId: 10,
      }),
    ).toEqual([10]);
  });

  it("returns empty list when no draft target is available", () => {
    expect(
      resolveDraftTargetIds({
        isDmView: false,
        activeDmUserIds: null,
        activeStreamId: null,
        fallbackStreamId: null,
      }),
    ).toEqual([]);
  });
});
