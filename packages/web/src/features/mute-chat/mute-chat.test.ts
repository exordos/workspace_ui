/**
 * Tests for the mute/unmute feature.
 *
 * Verifies that channels and topics can be muted/unmuted, and that
 * the mute state is correctly queried for notification filtering
 * and sidebar display.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMuteStore, topicKey } from "./mute-chat.model";
import {
  captureTopicVisibilityOverrideSnapshot,
  runOptimisticStreamMuteUpdate,
  runOptimisticTopicVisibilityUpdate,
} from "./mute-chat.optimistic.lib";

vi.mock("~/shared/api/client", () => ({
  messengerApi: {
    post: vi.fn(),
  },
}));

const TEST_STREAM_UUID = "00000000-0000-4000-8000-000000000010";
const STREAM_UUID_1 = "00000000-0000-4000-8000-000000000001";
const STREAM_UUID_7 = "00000000-0000-4000-8000-000000000007";
const STREAM_UUID_20 = "00000000-0000-4000-8000-000000000020";
const STREAM_UUID_42 = "00000000-0000-4000-8000-000000000042";
const UNKNOWN_STREAM_UUID = "00000000-0000-4000-8000-000000000999";

describe("useMuteStore", () => {
  afterEach(() => {
    useMuteStore.getState().clear();
  });

  // Stream (channel) muting
  describe("stream muting", () => {
    // Muting a stream should add its ID to the muted set
    it("muteStream adds stream to muted set", () => {
      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      expect(useMuteStore.getState().isStreamMuted(TEST_STREAM_UUID)).toBe(true);
    });

    // Unmuting should remove it
    it("unmuteStream removes stream from muted set", () => {
      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      useMuteStore.getState().unmuteStream(TEST_STREAM_UUID);
      expect(useMuteStore.getState().isStreamMuted(TEST_STREAM_UUID)).toBe(false);
    });

    // Streams that were never muted should return false
    it("isStreamMuted returns false for unknown stream", () => {
      expect(useMuteStore.getState().isStreamMuted(UNKNOWN_STREAM_UUID)).toBe(false);
    });

    // Muting the same stream twice should be idempotent
    it("muteStream is idempotent", () => {
      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      expect(useMuteStore.getState().mutedStreamIds.size).toBe(1);
    });
  });

  // Topic muting
  describe("topic muting", () => {
    // Muting a topic should add the composite key to the muted set
    it("muteTopic adds topic to muted set", () => {
      useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "announcements");
      expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "announcements")).toBe(true);
    });

    it("unmuteTopic stores topic as explicitly unmuted", () => {
      useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "announcements");
      useMuteStore.getState().unmuteTopic(TEST_STREAM_UUID, "announcements");
      expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "announcements")).toBe(false);
      expect(useMuteStore.getState().isTopicUnmuted(TEST_STREAM_UUID, "announcements")).toBe(true);
    });

    it("followTopic stores topic as explicitly followed", () => {
      useMuteStore.getState().followTopic(TEST_STREAM_UUID, "announcements");
      expect(useMuteStore.getState().isTopicFollowed(TEST_STREAM_UUID, "announcements")).toBe(true);
      expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "announcements")).toBe(false);
      expect(useMuteStore.getState().isTopicUnmuted(TEST_STREAM_UUID, "announcements")).toBe(false);
    });

    it("clearTopicVisibilityOverride removes explicit topic overrides", () => {
      useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "announcements");
      useMuteStore.getState().clearTopicVisibilityOverride(TEST_STREAM_UUID, "announcements");
      expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "announcements")).toBe(false);
      expect(useMuteStore.getState().isTopicUnmuted(TEST_STREAM_UUID, "announcements")).toBe(false);
      expect(useMuteStore.getState().isTopicFollowed(TEST_STREAM_UUID, "announcements")).toBe(
        false,
      );
    });

    // Topic muting is independent of stream muting
    it("topic mute is independent of stream mute", () => {
      useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "off-topic");
      expect(useMuteStore.getState().isStreamMuted(TEST_STREAM_UUID)).toBe(false);
      expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "off-topic")).toBe(true);
    });
  });

  // Effective mute (combines stream + topic)
  describe("isEffectivelyMuted", () => {
    // If the stream is muted, all topics are effectively muted
    it("returns true when stream is muted", () => {
      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      expect(useMuteStore.getState().isEffectivelyMuted(TEST_STREAM_UUID, "any-topic")).toBe(true);
    });

    // Even if stream is muted, an explicitly unmuted topic should not be muted
    it("returns false when stream is muted but topic is explicitly unmuted", () => {
      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      useMuteStore.getState().unmuteTopic(TEST_STREAM_UUID, "important");
      expect(useMuteStore.getState().isEffectivelyMuted(TEST_STREAM_UUID, "important")).toBe(false);
    });

    it("returns false when stream is muted but topic is explicitly followed", () => {
      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      useMuteStore.getState().followTopic(TEST_STREAM_UUID, "important");
      expect(useMuteStore.getState().isEffectivelyMuted(TEST_STREAM_UUID, "important")).toBe(false);
    });

    // If the topic itself is muted (not the stream), it should be effectively muted
    it("returns true when topic is muted even if stream is not", () => {
      useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "spam");
      expect(useMuteStore.getState().isEffectivelyMuted(TEST_STREAM_UUID, "spam")).toBe(true);
    });

    // Neither stream nor topic muted → not muted
    it("returns false when nothing is muted", () => {
      expect(useMuteStore.getState().isEffectivelyMuted(TEST_STREAM_UUID, "general")).toBe(false);
    });
  });

  // Bulk initialization from server data
  describe("setFromServer", () => {
    it("sets muted streams and topics from server data", () => {
      useMuteStore.getState().setFromServer({
        mutedStreamIds: [TEST_STREAM_UUID, STREAM_UUID_20],
        mutedTopics: [{ streamId: "00000000-0000-4000-8000-000000000010", topic: "spam" }],
        unmutedTopics: [{ streamId: "00000000-0000-4000-8000-000000000020", topic: "important" }],
        followedTopics: [{ streamId: "00000000-0000-4000-8000-000000000020", topic: "incidents" }],
      });

      expect(useMuteStore.getState().isStreamMuted(TEST_STREAM_UUID)).toBe(true);
      expect(useMuteStore.getState().isStreamMuted(STREAM_UUID_20)).toBe(true);
      expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "spam")).toBe(true);
      expect(useMuteStore.getState().isEffectivelyMuted(STREAM_UUID_20, "important")).toBe(false);
      expect(useMuteStore.getState().isTopicFollowed(STREAM_UUID_20, "incidents")).toBe(true);
    });

    it("sets per-channel desktop notification overrides", () => {
      useMuteStore.getState().setFromServer({
        mutedStreamIds: [],
        mutedTopics: [],
        unmutedTopics: [],
        followedTopics: [],
        streamDesktopNotifyEnabledIds: [STREAM_UUID_42],
        streamDesktopNotifyDisabledIds: [STREAM_UUID_7],
      });

      expect(useMuteStore.getState().getStreamDesktopNotificationsOverride(STREAM_UUID_42)).toBe(
        true,
      );
      expect(useMuteStore.getState().getStreamDesktopNotificationsOverride(STREAM_UUID_7)).toBe(
        false,
      );
      expect(useMuteStore.getState().getStreamNotificationLevel(STREAM_UUID_42)).toBe("subscribed");
      expect(useMuteStore.getState().getStreamNotificationLevel(STREAM_UUID_7)).toBe("default");
    });
  });

  describe("getStreamNotificationLevel", () => {
    it("reflects mute and subscribe state", () => {
      useMuteStore.getState().muteStream(STREAM_UUID_1);
      expect(useMuteStore.getState().getStreamNotificationLevel(STREAM_UUID_1)).toBe("muted");

      useMuteStore.getState().unmuteStream(STREAM_UUID_1);
      useMuteStore.getState().setStreamDesktopNotifications(STREAM_UUID_1, true);
      expect(useMuteStore.getState().getStreamNotificationLevel(STREAM_UUID_1)).toBe("subscribed");
    });
  });

  // Clear resets everything
  describe("clear", () => {
    it("resets all mute state", () => {
      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "x");
      useMuteStore.getState().unmuteTopic(TEST_STREAM_UUID, "y");
      useMuteStore.getState().followTopic(TEST_STREAM_UUID, "z");
      useMuteStore.getState().clear();
      expect(useMuteStore.getState().isStreamMuted(TEST_STREAM_UUID)).toBe(false);
      expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "x")).toBe(false);
      expect(useMuteStore.getState().isTopicUnmuted(TEST_STREAM_UUID, "y")).toBe(false);
      expect(useMuteStore.getState().isTopicFollowed(TEST_STREAM_UUID, "z")).toBe(false);
    });
  });
});

describe("topicKey", () => {
  // The composite key format should be stable for Map/Set lookups
  it("creates a stable composite key", () => {
    expect(topicKey(STREAM_UUID_42, "  HeLLo  ")).toBe(
      "00000000-0000-4000-8000-000000000042:hello",
    );
  });
});

describe("mute-chat optimistic helpers", () => {
  afterEach(() => {
    useMuteStore.getState().clear();
  });

  it("captures topic visibility snapshot from store", () => {
    useMuteStore.getState().followTopic(TEST_STREAM_UUID, "incidents");
    expect(captureTopicVisibilityOverrideSnapshot(TEST_STREAM_UUID, "incidents")).toBe("followed");
  });

  it("keeps optimistic topic state on successful request", async () => {
    const ok = await runOptimisticTopicVisibilityUpdate({
      streamId: TEST_STREAM_UUID,
      topic: "announcements",
      applyOptimistic: () => {
        useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "announcements");
      },
      request: () => Promise.resolve(true),
    });

    expect(ok).toBe(true);
    expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "announcements")).toBe(true);
  });

  it("rolls back topic visibility when request returns false", async () => {
    useMuteStore.getState().followTopic(TEST_STREAM_UUID, "announcements");

    const ok = await runOptimisticTopicVisibilityUpdate({
      streamId: TEST_STREAM_UUID,
      topic: "announcements",
      applyOptimistic: () => {
        useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "announcements");
      },
      request: () => Promise.resolve(false),
    });

    expect(ok).toBe(false);
    expect(useMuteStore.getState().isTopicFollowed(TEST_STREAM_UUID, "announcements")).toBe(true);
    expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "announcements")).toBe(false);
  });

  it("rolls back topic visibility when request throws", async () => {
    useMuteStore.getState().unmuteTopic(TEST_STREAM_UUID, "announcements");

    const ok = await runOptimisticTopicVisibilityUpdate({
      streamId: TEST_STREAM_UUID,
      topic: "announcements",
      applyOptimistic: () => {
        useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "announcements");
      },
      request: () => Promise.reject(new Error("offline")),
    });

    expect(ok).toBe(false);
    expect(useMuteStore.getState().isTopicUnmuted(TEST_STREAM_UUID, "announcements")).toBe(true);
    expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "announcements")).toBe(false);
  });

  it("rolls back topic notification level when request returns false", async () => {
    const { runOptimisticTopicNotificationLevelUpdate } =
      await import("./mute-chat-topic-notification.optimistic.lib");

    const ok = await runOptimisticTopicNotificationLevelUpdate({
      streamId: TEST_STREAM_UUID,
      topic: "incident",
      level: "muted",
      request: () => Promise.resolve(false),
    });

    expect(ok).toBe(false);
    expect(useMuteStore.getState().isTopicMuted(TEST_STREAM_UUID, "incident")).toBe(false);
    expect(useMuteStore.getState().getTopicNotificationLevel(TEST_STREAM_UUID, "incident")).toBe(
      "default",
    );
  });

  it("re-captures snapshot on each retry attempt", async () => {
    const streamId = TEST_STREAM_UUID;
    const topic = "release";

    const first = await runOptimisticTopicVisibilityUpdate({
      streamId,
      topic,
      applyOptimistic: () => {
        useMuteStore.getState().muteTopic(streamId, topic);
      },
      request: () => Promise.resolve(false),
    });

    expect(first).toBe(false);
    expect(useMuteStore.getState().isTopicMuted(streamId, topic)).toBe(false);

    useMuteStore.getState().followTopic(streamId, topic);

    const second = await runOptimisticTopicVisibilityUpdate({
      streamId,
      topic,
      applyOptimistic: () => {
        useMuteStore.getState().muteTopic(streamId, topic);
      },
      request: () => Promise.resolve(false),
    });

    expect(second).toBe(false);
    expect(useMuteStore.getState().isTopicFollowed(streamId, topic)).toBe(true);
    expect(useMuteStore.getState().isTopicMuted(streamId, topic)).toBe(false);
  });

  it("rolls back stream mute on failed request", async () => {
    const ok = await runOptimisticStreamMuteUpdate({
      streamId: TEST_STREAM_UUID,
      applyOptimistic: (wasMuted) => {
        const muteStore = useMuteStore.getState();
        if (wasMuted) {
          muteStore.unmuteStream(TEST_STREAM_UUID);
          return;
        }
        muteStore.muteStream(TEST_STREAM_UUID);
      },
      request: () => Promise.resolve(false),
    });

    expect(ok).toBe(false);
    expect(useMuteStore.getState().isStreamMuted(TEST_STREAM_UUID)).toBe(false);
  });
});

// Mute API — calls Workspace endpoints to mute/unmute streams and topics.
describe("mute-chat API", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("setStreamMuted", () => {
    it("returns false without calling removed subscription properties endpoint", async () => {
      const { messengerApi } = await import("~/shared/api/client");
      const { setStreamMuted } = await import("./mute-chat.api");

      await expect(setStreamMuted(TEST_STREAM_UUID, true)).resolves.toBe(false);

      expect(messengerApi.post).not.toHaveBeenCalled();
    });

    it("also skips the removed endpoint for unmute", async () => {
      const { messengerApi } = await import("~/shared/api/client");
      const { setStreamMuted } = await import("./mute-chat.api");

      await expect(setStreamMuted(TEST_STREAM_UUID, false)).resolves.toBe(false);

      expect(messengerApi.post).not.toHaveBeenCalled();
    });
  });

  describe("setTopicVisibility", () => {
    it("returns false without calling the removed topic visibility endpoint", async () => {
      const { messengerApi } = await import("~/shared/api/client");
      const { setTopicVisibility } = await import("./mute-chat.api");

      await expect(setTopicVisibility(TEST_STREAM_UUID, "announcements", 1)).resolves.toBe(false);

      expect(messengerApi.post).not.toHaveBeenCalled();
    });

    it("still validates stream UUIDs before returning unsupported", async () => {
      const { messengerApi } = await import("~/shared/api/client");
      const { setTopicVisibility } = await import("./mute-chat.api");

      await expect(setTopicVisibility("not-a-uuid", "announcements", 1)).rejects.toThrow(
        /Invalid streamUuid/,
      );
      expect(messengerApi.post).not.toHaveBeenCalled();
    });
  });

  // Convenience wrappers delegate to the unsupported facade without network calls.
  describe("muteStream / unmuteStream", () => {
    it("muteStream returns false without removed subscription call", async () => {
      const { messengerApi } = await import("~/shared/api/client");
      const { muteStream } = await import("./mute-chat.api");

      await expect(muteStream(TEST_STREAM_UUID)).resolves.toBe(false);

      expect(messengerApi.post).not.toHaveBeenCalled();
    });

    it("unmuteStream returns false without removed subscription call", async () => {
      const { messengerApi } = await import("~/shared/api/client");
      const { unmuteStream } = await import("./mute-chat.api");

      await expect(unmuteStream(TEST_STREAM_UUID)).resolves.toBe(false);

      expect(messengerApi.post).not.toHaveBeenCalled();
    });
  });

  describe("setStreamNotificationLevel", () => {
    it("returns false without calling removed subscription properties endpoint", async () => {
      const { messengerApi } = await import("~/shared/api/client");
      const { setStreamNotificationLevel } = await import("./mute-chat.api");

      await expect(setStreamNotificationLevel(TEST_STREAM_UUID, "subscribed")).resolves.toBe(false);
      await expect(setStreamNotificationLevel(TEST_STREAM_UUID, "muted")).resolves.toBe(false);

      expect(messengerApi.post).not.toHaveBeenCalled();
    });
  });

  describe("topic visibility wrappers", () => {
    it("return false without calling the removed topic visibility endpoint", async () => {
      const { messengerApi } = await import("~/shared/api/client");
      const { muteTopic, unmuteTopic, unmuteTopicInMutedStream } = await import("./mute-chat.api");

      await expect(muteTopic(TEST_STREAM_UUID, "off-topic")).resolves.toBe(false);
      await expect(unmuteTopic(TEST_STREAM_UUID, "off-topic")).resolves.toBe(false);
      await expect(unmuteTopicInMutedStream(TEST_STREAM_UUID, "off-topic")).resolves.toBe(false);

      expect(messengerApi.post).not.toHaveBeenCalled();
    });
  });

  describe("topic notification level helpers", () => {
    it("return false without calling the removed topic visibility endpoint", async () => {
      const { messengerApi } = await import("~/shared/api/client");
      const { setTopicNotificationLevel, setTopicVisibilityLevel } =
        await import("./mute-chat.api");

      await expect(setTopicNotificationLevel(TEST_STREAM_UUID, "general", "muted")).resolves.toBe(
        false,
      );
      await expect(
        setTopicNotificationLevel(TEST_STREAM_UUID, "general", "subscribed"),
      ).resolves.toBe(false);
      await expect(setTopicNotificationLevel(TEST_STREAM_UUID, "general", "default")).resolves.toBe(
        false,
      );
      await expect(setTopicVisibilityLevel(TEST_STREAM_UUID, "general", "followed")).resolves.toBe(
        false,
      );

      expect(messengerApi.post).not.toHaveBeenCalled();
    });
  });

  describe("getTopicVisibilityLevel", () => {
    it("reflects explicit visibility_policy overrides only", () => {
      useMuteStore.getState().followTopic(TEST_STREAM_UUID, "alerts");
      expect(useMuteStore.getState().getTopicVisibilityLevel(TEST_STREAM_UUID, "alerts")).toBe(
        "followed",
      );

      useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "noise");
      expect(useMuteStore.getState().getTopicVisibilityLevel(TEST_STREAM_UUID, "noise")).toBe(
        "muted",
      );

      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      useMuteStore.getState().unmuteTopic(TEST_STREAM_UUID, "important");
      expect(useMuteStore.getState().getTopicVisibilityLevel(TEST_STREAM_UUID, "important")).toBe(
        "unmuted",
      );
      expect(useMuteStore.getState().getTopicVisibilityLevel(TEST_STREAM_UUID, "other")).toBe(
        "inherit",
      );
    });
  });

  describe("getTopicNotificationLevel", () => {
    it("reflects followed, muted, and unmuted-in-muted-stream overrides", () => {
      useMuteStore.getState().followTopic(TEST_STREAM_UUID, "alerts");
      expect(useMuteStore.getState().getTopicNotificationLevel(TEST_STREAM_UUID, "alerts")).toBe(
        "subscribed",
      );

      useMuteStore.getState().muteTopic(TEST_STREAM_UUID, "noise");
      expect(useMuteStore.getState().getTopicNotificationLevel(TEST_STREAM_UUID, "noise")).toBe(
        "muted",
      );

      useMuteStore.getState().muteStream(TEST_STREAM_UUID);
      useMuteStore.getState().unmuteTopic(TEST_STREAM_UUID, "important");
      expect(useMuteStore.getState().getTopicNotificationLevel(TEST_STREAM_UUID, "important")).toBe(
        "default",
      );
      expect(useMuteStore.getState().getTopicNotificationLevel(TEST_STREAM_UUID, "other")).toBe(
        "muted",
      );
    });
  });
});
