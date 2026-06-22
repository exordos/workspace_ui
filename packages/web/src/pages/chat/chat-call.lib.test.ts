import { describe, expect, it } from "vitest";
import {
  buildCallRoomName,
  canStartCallFromHeader,
  resolveCallMessageTargetParams,
} from "./chat-call.lib";

const streamUuid = "22222222-2222-4222-8222-222222222222";
const topicUuid = "33333333-3333-4333-8333-333333333333";

describe("resolveCallMessageTargetParams", () => {
  it("returns normalized DM target when DM chat has recipients", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: true,
        activeDmUserIds: [42, 7, 42],
        activeStream: null,
        activeStreamUuid: streamUuid,
        activeTopic: null,
        activeTopicUuid: null,
      }),
    ).toEqual({
      mode: "dm",
      to: [7, 42],
      streamUuid,
    });
  });

  it("returns null when DM chat has no recipients", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: true,
        activeDmUserIds: [],
        activeStream: null,
        activeStreamUuid: streamUuid,
        activeTopic: null,
        activeTopicUuid: null,
      }),
    ).toBeNull();
  });

  it("returns null when DM stream uuid is unavailable", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: true,
        activeDmUserIds: [42],
        activeStream: null,
        activeStreamUuid: null,
        activeTopic: null,
        activeTopicUuid: null,
      }),
    ).toBeNull();
  });

  it("returns null when DM recipients contain invalid user ids", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: true,
        activeDmUserIds: [42, 0],
        activeStream: null,
        activeStreamUuid: streamUuid,
        activeTopic: null,
        activeTopicUuid: null,
      }),
    ).toBeNull();
  });

  it("returns stream target and falls back to empty topic when topic is empty", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: false,
        activeDmUserIds: null,
        activeStream: "engineering",
        activeStreamUuid: streamUuid,
        activeTopic: " ",
        activeTopicUuid: topicUuid,
      }),
    ).toEqual({
      mode: "stream",
      stream: "engineering",
      streamUuid,
      subject: "",
      topicUuid,
    });
  });

  it("returns null when stream target is unavailable", () => {
    expect(
      resolveCallMessageTargetParams({
        isDmView: false,
        activeDmUserIds: null,
        activeStream: " ",
        activeStreamUuid: streamUuid,
        activeTopic: "planning",
        activeTopicUuid: null,
      }),
    ).toBeNull();
  });
});

describe("buildCallRoomName", () => {
  it("builds readable DM room name from current chat label", () => {
    expect(
      buildCallRoomName({
        target: { mode: "dm", to: [42, 7, 42], streamUuid },
        currentUserId: 15,
        chatLabel: "Design Sync",
        nowMs: 123,
      }),
    ).toBe("messenger-dm-design-sync-123");
  });

  it("builds stream room name from stream and topic labels", () => {
    expect(
      buildCallRoomName({
        target: {
          mode: "stream",
          stream: "Engineering Team",
          streamUuid,
          subject: "Sprint / Demo",
        },
        currentUserId: 42,
        nowMs: 77,
      }),
    ).toBe("messenger-stream-engineering-team-sprint-demo-77");
  });

  it("keeps unicode letters readable in room names", () => {
    expect(
      buildCallRoomName({
        target: { mode: "dm", to: [7, 42], streamUuid },
        currentUserId: 15,
        chatLabel: "Команда разработки",
        nowMs: 55,
      }),
    ).toBe("messenger-dm-команда-разработки-55");
  });

  it("falls back to participant ids when chat label is unavailable", () => {
    expect(
      buildCallRoomName({
        target: { mode: "dm", to: [42, 7], streamUuid },
        currentUserId: null,
        nowMs: 987,
      }),
    ).toBe("messenger-dm-7-42-987");
  });
});

describe("canStartCallFromHeader", () => {
  it("returns false when call target is missing", () => {
    expect(canStartCallFromHeader({ target: null, currentUserId: 42 })).toBe(false);
  });

  it("returns false when current user id is not ready", () => {
    expect(
      canStartCallFromHeader({
        target: { mode: "dm", to: [7, 42], streamUuid },
        currentUserId: null,
      }),
    ).toBe(false);
    expect(
      canStartCallFromHeader({
        target: { mode: "stream", stream: "engineering", streamUuid, subject: "" },
        currentUserId: 0,
      }),
    ).toBe(false);
  });

  it("returns true when target and current user id are valid", () => {
    expect(
      canStartCallFromHeader({
        target: { mode: "dm", to: [7, 42], streamUuid },
        currentUserId: 15,
      }),
    ).toBe(true);
  });
});
