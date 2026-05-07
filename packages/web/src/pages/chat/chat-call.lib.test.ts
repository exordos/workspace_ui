import { describe, expect, it } from "vitest";
import {
  buildCallRoomName,
  canStartCallFromHeader,
  resolveCallMessageTargetParams,
} from "./chat-call.lib";

describe("resolveCallMessageTargetParams", () => {
  it("returns normalized DM target when DM chat has recipients", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: true,
        activeDmUserIds: [42, 7, 42],
        activeStream: null,
        activeStreamId: null,
        activeTopic: null,
      }),
    ).toEqual({
      mode: "dm",
      to: [7, 42],
    });
  });

  it("returns null when DM chat has no recipients", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: true,
        activeDmUserIds: [],
        activeStream: null,
        activeStreamId: null,
        activeTopic: null,
      }),
    ).toBeNull();
  });

  it("returns null when DM recipients contain invalid user ids", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: true,
        activeDmUserIds: [42, 0],
        activeStream: null,
        activeStreamId: null,
        activeTopic: null,
      }),
    ).toBeNull();
  });

  it("returns stream target and falls back to empty topic when topic is empty", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: false,
        activeDmUserIds: null,
        activeStream: "engineering",
        activeStreamId: 10,
        activeTopic: " ",
      }),
    ).toEqual({
      mode: "stream",
      stream: "engineering",
      streamId: 10,
      subject: "",
    });
  });

  it("returns null when stream target is unavailable", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: false,
        activeDmUserIds: null,
        activeStream: " ",
        activeStreamId: null,
        activeTopic: "planning",
      }),
    ).toBeNull();
  });
});

describe("buildCallRoomName", () => {
  it("builds readable DM room name from current chat label", () => {
    expect(
      buildCallRoomName({
        target: { mode: "dm", to: [42, 7, 42] },
        currentUserId: 15,
        chatLabel: "Design Sync",
        nowMs: 123,
      }),
    ).toBe("zulip-dm-design-sync-123");
  });

  it("builds stream room name from stream and topic labels", () => {
    expect(
      buildCallRoomName({
        target: {
          mode: "stream",
          stream: "Engineering Team",
          streamId: 10,
          subject: "Sprint / Demo",
        },
        currentUserId: 42,
        nowMs: 77,
      }),
    ).toBe("zulip-stream-engineering-team-sprint-demo-77");
  });

  it("keeps unicode letters readable in room names", () => {
    expect(
      buildCallRoomName({
        target: { mode: "dm", to: [7, 42] },
        currentUserId: 15,
        chatLabel: "Команда разработки",
        nowMs: 55,
      }),
    ).toBe("zulip-dm-команда-разработки-55");
  });

  it("falls back to participant ids when chat label is unavailable", () => {
    expect(
      buildCallRoomName({
        target: { mode: "dm", to: [42, 7] },
        currentUserId: null,
        nowMs: 987,
      }),
    ).toBe("zulip-dm-7-42-987");
  });
});

describe("canStartCallFromHeader", () => {
  it("returns false when call target is missing", () => {
    expect(canStartCallFromHeader({ target: null, currentUserId: 42 })).toBe(false);
  });

  it("returns false when current user id is not ready", () => {
    expect(
      canStartCallFromHeader({
        target: { mode: "dm", to: [7, 42] },
        currentUserId: null,
      }),
    ).toBe(false);
    expect(
      canStartCallFromHeader({
        target: { mode: "stream", stream: "engineering", streamId: 10, subject: "" },
        currentUserId: 0,
      }),
    ).toBe(false);
  });

  it("returns true when target and current user id are valid", () => {
    expect(
      canStartCallFromHeader({
        target: { mode: "dm", to: [7, 42] },
        currentUserId: 15,
      }),
    ).toBe(true);
  });
});
