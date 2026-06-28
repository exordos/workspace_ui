import { beforeEach, describe, expect, it, vi } from "vitest";
import { markDmAsRead, markTopicAsRead } from "~/shared/api/messenger-read-state";
import {
  applyOpenChatMarkAllAsRead,
  resolveMarkAllAsReadTarget,
  type MarkAllAsReadTarget,
} from "./chat-mark-all-read.lib";

vi.mock("~/shared/api/messenger-read-state", () => ({
  markDmAsRead: vi.fn().mockResolvedValue(true),
  markTopicAsRead: vi.fn().mockResolvedValue(true),
}));

const STREAM_UUID = "11111111-1111-4111-8111-111111111111";
const TOPIC_UUID = "22222222-2222-4222-8222-222222222222";

function expectTarget(
  actual: MarkAllAsReadTarget | null,
  expected: MarkAllAsReadTarget | null,
): void {
  expect(actual).toEqual(expected);
}

describe("chat-mark-all-read", () => {
  beforeEach(() => {
    vi.mocked(markDmAsRead).mockClear();
    vi.mocked(markTopicAsRead).mockClear();
    vi.mocked(markDmAsRead).mockResolvedValue(true);
    vi.mocked(markTopicAsRead).mockResolvedValue(true);
  });

  it("returns dm target for DM chat with valid participants", () => {
    expectTarget(
      resolveMarkAllAsReadTarget({
        isDmView: true,
        activeDmUserIds: [42, 7],
        activeDmStreamId: STREAM_UUID,
        activeStreamId: null,
        activeTopic: undefined,
      }),
      { type: "dm", userIds: [42, 7], streamId: STREAM_UUID },
    );
  });

  it("returns null for DM chat without participants", () => {
    expectTarget(
      resolveMarkAllAsReadTarget({
        isDmView: true,
        activeDmUserIds: [],
        activeStreamId: null,
        activeTopic: undefined,
      }),
      null,
    );
  });

  it("returns null for stream-wide chat without topic in route", () => {
    expectTarget(
      resolveMarkAllAsReadTarget({
        isDmView: false,
        activeDmUserIds: null,
        activeStreamId: STREAM_UUID,
        activeTopic: undefined,
      }),
      null,
    );
  });

  it("returns topic target for stream topic route", () => {
    expectTarget(
      resolveMarkAllAsReadTarget({
        isDmView: false,
        activeDmUserIds: null,
        activeStreamId: STREAM_UUID,
        activeTopic: "incident",
        activeTopicUuid: TOPIC_UUID,
      }),
      { type: "topic", streamId: STREAM_UUID, topic: "incident", topicUuid: TOPIC_UUID },
    );
  });

  it("marks DM target read through server API", async () => {
    await expect(
      applyOpenChatMarkAllAsRead({
        target: { type: "dm", userIds: [42, 7], streamId: STREAM_UUID },
        currentUserId: 7,
      }),
    ).resolves.toBe(true);

    expect(markDmAsRead).toHaveBeenCalledWith([42, 7], STREAM_UUID);
    expect(markTopicAsRead).not.toHaveBeenCalled();
  });

  it("marks topic target read through server API", async () => {
    await expect(
      applyOpenChatMarkAllAsRead({
        target: { type: "topic", streamId: STREAM_UUID, topic: "bugs", topicUuid: TOPIC_UUID },
        currentUserId: 1,
      }),
    ).resolves.toBe(true);

    expect(markTopicAsRead).toHaveBeenCalledWith(STREAM_UUID, "bugs", TOPIC_UUID);
    expect(markDmAsRead).not.toHaveBeenCalled();
  });
});
