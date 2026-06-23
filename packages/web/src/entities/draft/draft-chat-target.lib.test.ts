import { describe, expect, it } from "vitest";
import { resolveDraftTargetIds } from "./draft-chat-target.lib";

const STREAM_UUID = "00000000-0000-4000-8000-000000000010";
const FALLBACK_STREAM_UUID = "00000000-0000-4000-8000-000000000001";

describe("resolveDraftTargetIds", () => {
  it("returns dm user ids in dm view", () => {
    expect(
      resolveDraftTargetIds({
        isDmView: true,
        activeDmUserIds: [7, 42],
        activeStreamId: null,
        fallbackStreamId: STREAM_UUID,
      }),
    ).toEqual([7, 42]);
  });

  it("prioritizes stream id from route for stream chats", () => {
    expect(
      resolveDraftTargetIds({
        isDmView: false,
        activeDmUserIds: null,
        activeStreamId: STREAM_UUID,
        fallbackStreamId: FALLBACK_STREAM_UUID,
      }),
    ).toEqual([STREAM_UUID]);
  });

  it("falls back to context stream id when route stream id is missing", () => {
    expect(
      resolveDraftTargetIds({
        isDmView: false,
        activeDmUserIds: null,
        activeStreamId: null,
        fallbackStreamId: STREAM_UUID,
      }),
    ).toEqual([STREAM_UUID]);
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
