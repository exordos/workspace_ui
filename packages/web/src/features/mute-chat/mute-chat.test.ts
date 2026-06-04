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
  zulipApi: {
    post: vi.fn(),
  },
}));

describe("useMuteStore", () => {
  afterEach(() => {
    useMuteStore.getState().clear();
  });

  // Stream (channel) muting
  describe("stream muting", () => {
    // Muting a stream should add its ID to the muted set
    it("muteStream adds stream to muted set", () => {
      useMuteStore.getState().muteStream(10);
      expect(useMuteStore.getState().isStreamMuted(10)).toBe(true);
    });

    // Unmuting should remove it
    it("unmuteStream removes stream from muted set", () => {
      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().unmuteStream(10);
      expect(useMuteStore.getState().isStreamMuted(10)).toBe(false);
    });

    // Streams that were never muted should return false
    it("isStreamMuted returns false for unknown stream", () => {
      expect(useMuteStore.getState().isStreamMuted(999)).toBe(false);
    });

    // Muting the same stream twice should be idempotent
    it("muteStream is idempotent", () => {
      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().muteStream(10);
      expect(useMuteStore.getState().mutedStreamIds.size).toBe(1);
    });
  });

  // Topic muting
  describe("topic muting", () => {
    // Muting a topic should add the composite key to the muted set
    it("muteTopic adds topic to muted set", () => {
      useMuteStore.getState().muteTopic(10, "announcements");
      expect(useMuteStore.getState().isTopicMuted(10, "announcements")).toBe(true);
    });

    it("unmuteTopic stores topic as explicitly unmuted", () => {
      useMuteStore.getState().muteTopic(10, "announcements");
      useMuteStore.getState().unmuteTopic(10, "announcements");
      expect(useMuteStore.getState().isTopicMuted(10, "announcements")).toBe(false);
      expect(useMuteStore.getState().isTopicUnmuted(10, "announcements")).toBe(true);
    });

    it("followTopic stores topic as explicitly followed", () => {
      useMuteStore.getState().followTopic(10, "announcements");
      expect(useMuteStore.getState().isTopicFollowed(10, "announcements")).toBe(true);
      expect(useMuteStore.getState().isTopicMuted(10, "announcements")).toBe(false);
      expect(useMuteStore.getState().isTopicUnmuted(10, "announcements")).toBe(false);
    });

    it("clearTopicVisibilityOverride removes explicit topic overrides", () => {
      useMuteStore.getState().muteTopic(10, "announcements");
      useMuteStore.getState().clearTopicVisibilityOverride(10, "announcements");
      expect(useMuteStore.getState().isTopicMuted(10, "announcements")).toBe(false);
      expect(useMuteStore.getState().isTopicUnmuted(10, "announcements")).toBe(false);
      expect(useMuteStore.getState().isTopicFollowed(10, "announcements")).toBe(false);
    });

    // Topic muting is independent of stream muting
    it("topic mute is independent of stream mute", () => {
      useMuteStore.getState().muteTopic(10, "off-topic");
      expect(useMuteStore.getState().isStreamMuted(10)).toBe(false);
      expect(useMuteStore.getState().isTopicMuted(10, "off-topic")).toBe(true);
    });
  });

  // Effective mute (combines stream + topic)
  describe("isEffectivelyMuted", () => {
    // If the stream is muted, all topics are effectively muted
    it("returns true when stream is muted", () => {
      useMuteStore.getState().muteStream(10);
      expect(useMuteStore.getState().isEffectivelyMuted(10, "any-topic")).toBe(true);
    });

    // Even if stream is muted, an explicitly unmuted topic should not be muted
    it("returns false when stream is muted but topic is explicitly unmuted", () => {
      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().unmuteTopic(10, "important");
      expect(useMuteStore.getState().isEffectivelyMuted(10, "important")).toBe(false);
    });

    it("returns false when stream is muted but topic is explicitly followed", () => {
      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().followTopic(10, "important");
      expect(useMuteStore.getState().isEffectivelyMuted(10, "important")).toBe(false);
    });

    // If the topic itself is muted (not the stream), it should be effectively muted
    it("returns true when topic is muted even if stream is not", () => {
      useMuteStore.getState().muteTopic(10, "spam");
      expect(useMuteStore.getState().isEffectivelyMuted(10, "spam")).toBe(true);
    });

    // Neither stream nor topic muted → not muted
    it("returns false when nothing is muted", () => {
      expect(useMuteStore.getState().isEffectivelyMuted(10, "general")).toBe(false);
    });
  });

  // Bulk initialization from server data
  describe("setFromServer", () => {
    it("sets muted streams and topics from server data", () => {
      useMuteStore.getState().setFromServer({
        mutedStreamIds: [10, 20],
        mutedTopics: [{ streamId: 10, topic: "spam" }],
        unmutedTopics: [{ streamId: 20, topic: "important" }],
        followedTopics: [{ streamId: 20, topic: "incidents" }],
      });

      expect(useMuteStore.getState().isStreamMuted(10)).toBe(true);
      expect(useMuteStore.getState().isStreamMuted(20)).toBe(true);
      expect(useMuteStore.getState().isTopicMuted(10, "spam")).toBe(true);
      expect(useMuteStore.getState().isEffectivelyMuted(20, "important")).toBe(false);
      expect(useMuteStore.getState().isTopicFollowed(20, "incidents")).toBe(true);
    });

    it("sets per-channel desktop notification overrides", () => {
      useMuteStore.getState().setFromServer({
        mutedStreamIds: [],
        mutedTopics: [],
        unmutedTopics: [],
        followedTopics: [],
        streamDesktopNotifyEnabledIds: [42],
        streamDesktopNotifyDisabledIds: [7],
      });

      expect(useMuteStore.getState().getStreamDesktopNotificationsOverride(42)).toBe(true);
      expect(useMuteStore.getState().getStreamDesktopNotificationsOverride(7)).toBe(false);
      expect(useMuteStore.getState().getStreamNotificationLevel(42)).toBe("subscribed");
      expect(useMuteStore.getState().getStreamNotificationLevel(7)).toBe("default");
    });
  });

  describe("getStreamNotificationLevel", () => {
    it("reflects mute and subscribe state", () => {
      useMuteStore.getState().muteStream(1);
      expect(useMuteStore.getState().getStreamNotificationLevel(1)).toBe("muted");

      useMuteStore.getState().unmuteStream(1);
      useMuteStore.getState().setStreamDesktopNotifications(1, true);
      expect(useMuteStore.getState().getStreamNotificationLevel(1)).toBe("subscribed");
    });
  });

  // Clear resets everything
  describe("clear", () => {
    it("resets all mute state", () => {
      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().muteTopic(10, "x");
      useMuteStore.getState().unmuteTopic(10, "y");
      useMuteStore.getState().followTopic(10, "z");
      useMuteStore.getState().clear();
      expect(useMuteStore.getState().isStreamMuted(10)).toBe(false);
      expect(useMuteStore.getState().isTopicMuted(10, "x")).toBe(false);
      expect(useMuteStore.getState().isTopicUnmuted(10, "y")).toBe(false);
      expect(useMuteStore.getState().isTopicFollowed(10, "z")).toBe(false);
    });
  });
});

describe("topicKey", () => {
  // The composite key format should be stable for Map/Set lookups
  it("creates a stable composite key", () => {
    expect(topicKey(42, "  HeLLo  ")).toBe("42:hello");
  });
});

describe("mute-chat optimistic helpers", () => {
  afterEach(() => {
    useMuteStore.getState().clear();
  });

  it("captures topic visibility snapshot from store", () => {
    useMuteStore.getState().followTopic(10, "incidents");
    expect(captureTopicVisibilityOverrideSnapshot(10, "incidents")).toBe("followed");
  });

  it("keeps optimistic topic state on successful request", async () => {
    const ok = await runOptimisticTopicVisibilityUpdate({
      streamId: 10,
      topic: "announcements",
      applyOptimistic: () => {
        useMuteStore.getState().muteTopic(10, "announcements");
      },
      request: () => Promise.resolve(true),
    });

    expect(ok).toBe(true);
    expect(useMuteStore.getState().isTopicMuted(10, "announcements")).toBe(true);
  });

  it("rolls back topic visibility when request returns false", async () => {
    useMuteStore.getState().followTopic(10, "announcements");

    const ok = await runOptimisticTopicVisibilityUpdate({
      streamId: 10,
      topic: "announcements",
      applyOptimistic: () => {
        useMuteStore.getState().muteTopic(10, "announcements");
      },
      request: () => Promise.resolve(false),
    });

    expect(ok).toBe(false);
    expect(useMuteStore.getState().isTopicFollowed(10, "announcements")).toBe(true);
    expect(useMuteStore.getState().isTopicMuted(10, "announcements")).toBe(false);
  });

  it("rolls back topic visibility when request throws", async () => {
    useMuteStore.getState().unmuteTopic(10, "announcements");

    const ok = await runOptimisticTopicVisibilityUpdate({
      streamId: 10,
      topic: "announcements",
      applyOptimistic: () => {
        useMuteStore.getState().muteTopic(10, "announcements");
      },
      request: () => Promise.reject(new Error("offline")),
    });

    expect(ok).toBe(false);
    expect(useMuteStore.getState().isTopicUnmuted(10, "announcements")).toBe(true);
    expect(useMuteStore.getState().isTopicMuted(10, "announcements")).toBe(false);
  });

  it("rolls back topic notification level when request returns false", async () => {
    const { runOptimisticTopicNotificationLevelUpdate } =
      await import("./mute-chat-topic-notification.optimistic.lib");

    const ok = await runOptimisticTopicNotificationLevelUpdate({
      streamId: 10,
      topic: "incident",
      level: "muted",
      request: () => Promise.resolve(false),
    });

    expect(ok).toBe(false);
    expect(useMuteStore.getState().isTopicMuted(10, "incident")).toBe(false);
    expect(useMuteStore.getState().getTopicNotificationLevel(10, "incident")).toBe("default");
  });

  it("re-captures snapshot on each retry attempt", async () => {
    const streamId = 10;
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
      streamId: 10,
      applyOptimistic: (wasMuted) => {
        const muteStore = useMuteStore.getState();
        if (wasMuted) {
          muteStore.unmuteStream(10);
          return;
        }
        muteStore.muteStream(10);
      },
      request: () => Promise.resolve(false),
    });

    expect(ok).toBe(false);
    expect(useMuteStore.getState().isStreamMuted(10)).toBe(false);
  });
});

// Mute API — calls Zulip endpoints to mute/unmute streams and topics.
describe("mute-chat API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockOk = {
    ok: true,
    status: 200,
    data: {},
    headers: new Headers(),
    raw: new Response(),
    durationMs: 20,
  };

  const mockFail = {
    ok: false,
    status: 400,
    data: null,
    headers: new Headers(),
    raw: new Response(),
    durationMs: 10,
  };

  describe("setStreamMuted", () => {
    it("sends mute request with correct subscription data", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setStreamMuted } = await import("./mute-chat.api");
      const result = await setStreamMuted(10, true);

      expect(result).toBe(true);
      expect(zulipApi.post).toHaveBeenCalledWith("/users/me/subscriptions/properties", {
        subscription_data: JSON.stringify([{ stream_id: 10, property: "is_muted", value: true }]),
      });
    });

    it("sends unmute request with value=false", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setStreamMuted } = await import("./mute-chat.api");
      await setStreamMuted(10, false);

      expect(zulipApi.post).toHaveBeenCalledWith(
        "/users/me/subscriptions/properties",
        expect.objectContaining({
          subscription_data: JSON.stringify([
            { stream_id: 10, property: "is_muted", value: false },
          ]),
        }),
      );
    });

    it("returns false on API failure", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockFail);

      const { setStreamMuted } = await import("./mute-chat.api");
      expect(await setStreamMuted(10, true)).toBe(false);
    });

    it("returns false on network error", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockRejectedValue(new Error("Timeout"));

      const { setStreamMuted } = await import("./mute-chat.api");
      expect(await setStreamMuted(10, true)).toBe(false);
    });
  });

  describe("setTopicVisibility", () => {
    it("sends topic visibility policy with correct params", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setTopicVisibility } = await import("./mute-chat.api");
      const result = await setTopicVisibility(10, "announcements", 1);

      expect(result).toBe(true);
      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "announcements",
        visibility_policy: "1",
      });
    });

    it("preserves literal general topic in user_topics payload", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setTopicVisibility } = await import("./mute-chat.api");
      const result = await setTopicVisibility(10, "general", 1);

      expect(result).toBe(true);
      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "general",
        visibility_policy: "1",
      });
    });

    it("supports explicit empty topic in user_topics payload", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setTopicVisibility } = await import("./mute-chat.api");
      const result = await setTopicVisibility(10, "", 1);

      expect(result).toBe(true);
      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "",
        visibility_policy: "1",
      });
    });

    it("returns false on API failure", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockFail);

      const { setTopicVisibility } = await import("./mute-chat.api");
      expect(await setTopicVisibility(10, "spam", 1)).toBe(false);
    });

    it("returns false on network error", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockRejectedValue(new Error("Offline"));

      const { setTopicVisibility } = await import("./mute-chat.api");
      expect(await setTopicVisibility(10, "spam", 1)).toBe(false);
    });
  });

  // Convenience wrappers delegate to the core functions.
  describe("muteStream / unmuteStream", () => {
    it("muteStream calls setStreamMuted with true", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { muteStream } = await import("./mute-chat.api");
      expect(await muteStream(42)).toBe(true);

      const body = vi.mocked(zulipApi.post).mock.calls[0]![1];
      const data = JSON.parse(body.subscription_data!) as { value: boolean }[];
      expect(data[0]!.value).toBe(true);
    });

    it("unmuteStream calls setStreamMuted with false", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockClear();
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { unmuteStream } = await import("./mute-chat.api");
      expect(await unmuteStream(42)).toBe(true);

      const body = vi.mocked(zulipApi.post).mock.calls[0]![1];
      const data = JSON.parse(body.subscription_data!) as { value: boolean }[];
      expect(data[0]!.value).toBe(false);
    });
  });

  describe("setStreamNotificationLevel", () => {
    it("sends mute and desktop properties for subscribed level", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockClear();
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setStreamNotificationLevel } = await import("./mute-chat.api");
      const result = await setStreamNotificationLevel(10, "subscribed");

      expect(result).toBe(true);
      const body = vi.mocked(zulipApi.post).mock.calls.at(-1)![1];
      const data = JSON.parse(body.subscription_data!) as { property: string; value: boolean }[];
      expect(data).toEqual(
        expect.arrayContaining([
          { stream_id: 10, property: "is_muted", value: false },
          { stream_id: 10, property: "desktop_notifications", value: true },
          { stream_id: 10, property: "audible_notifications", value: true },
        ]),
      );
    });

    it("sends only is_muted for muted level", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockClear();
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setStreamNotificationLevel } = await import("./mute-chat.api");
      await setStreamNotificationLevel(10, "muted");

      const body = vi.mocked(zulipApi.post).mock.calls.at(-1)![1];
      const data = JSON.parse(body.subscription_data!) as { property: string }[];
      expect(data).toEqual([{ stream_id: 10, property: "is_muted", value: true }]);
    });
  });

  describe("muteTopic / unmuteTopic", () => {
    it("muteTopic sends MUTED policy (1)", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { muteTopic } = await import("./mute-chat.api");
      expect(await muteTopic(10, "off-topic")).toBe(true);

      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "off-topic",
        visibility_policy: "1",
      });
    });

    it("unmuteTopic sends INHERIT policy (0)", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { unmuteTopic } = await import("./mute-chat.api");
      expect(await unmuteTopic(10, "off-topic")).toBe(true);

      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "off-topic",
        visibility_policy: "0",
      });
    });

    it("unmuteTopicInMutedStream sends UNMUTED policy (2)", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { unmuteTopicInMutedStream } = await import("./mute-chat.api");
      expect(await unmuteTopicInMutedStream(10, "off-topic")).toBe(true);

      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "off-topic",
        visibility_policy: "2",
      });
    });
  });

  describe("setTopicNotificationLevel", () => {
    it("maps muted, subscribed, and default in a normal stream", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockClear();
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setTopicNotificationLevel } = await import("./mute-chat.api");

      expect(await setTopicNotificationLevel(10, "general", "muted")).toBe(true);
      expect(await setTopicNotificationLevel(10, "general", "subscribed")).toBe(true);
      expect(await setTopicNotificationLevel(10, "general", "default")).toBe(true);

      expect(zulipApi.post).toHaveBeenNthCalledWith(1, "/user_topics", {
        stream_id: "10",
        topic: "general",
        visibility_policy: "1",
      });
      expect(zulipApi.post).toHaveBeenNthCalledWith(2, "/user_topics", {
        stream_id: "10",
        topic: "general",
        visibility_policy: "3",
      });
      expect(zulipApi.post).toHaveBeenNthCalledWith(3, "/user_topics", {
        stream_id: "10",
        topic: "general",
        visibility_policy: "0",
      });
    });

    it("uses UNMUTED policy for default when stream is muted", async () => {
      useMuteStore.getState().muteStream(10);
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setTopicNotificationLevel } = await import("./mute-chat.api");
      expect(await setTopicNotificationLevel(10, "general", "default")).toBe(true);

      expect(zulipApi.post).toHaveBeenCalledWith("/user_topics", {
        stream_id: "10",
        topic: "general",
        visibility_policy: "2",
      });
    });
  });

  describe("setTopicVisibilityLevel", () => {
    it("maps each TopicVisibilityLevel to visibility_policy", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.post).mockClear();
      vi.mocked(zulipApi.post).mockResolvedValue(mockOk);

      const { setTopicVisibilityLevel } = await import("./mute-chat.api");

      expect(await setTopicVisibilityLevel(10, "general", "muted")).toBe(true);
      expect(await setTopicVisibilityLevel(10, "general", "inherit")).toBe(true);
      expect(await setTopicVisibilityLevel(10, "general", "unmuted")).toBe(true);
      expect(await setTopicVisibilityLevel(10, "general", "followed")).toBe(true);

      expect(zulipApi.post).toHaveBeenNthCalledWith(1, "/user_topics", {
        stream_id: "10",
        topic: "general",
        visibility_policy: "1",
      });
      expect(zulipApi.post).toHaveBeenNthCalledWith(2, "/user_topics", {
        stream_id: "10",
        topic: "general",
        visibility_policy: "0",
      });
      expect(zulipApi.post).toHaveBeenNthCalledWith(3, "/user_topics", {
        stream_id: "10",
        topic: "general",
        visibility_policy: "2",
      });
      expect(zulipApi.post).toHaveBeenNthCalledWith(4, "/user_topics", {
        stream_id: "10",
        topic: "general",
        visibility_policy: "3",
      });
    });
  });

  describe("getTopicVisibilityLevel", () => {
    it("reflects explicit visibility_policy overrides only", () => {
      useMuteStore.getState().followTopic(10, "alerts");
      expect(useMuteStore.getState().getTopicVisibilityLevel(10, "alerts")).toBe("followed");

      useMuteStore.getState().muteTopic(10, "noise");
      expect(useMuteStore.getState().getTopicVisibilityLevel(10, "noise")).toBe("muted");

      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().unmuteTopic(10, "important");
      expect(useMuteStore.getState().getTopicVisibilityLevel(10, "important")).toBe("unmuted");
      expect(useMuteStore.getState().getTopicVisibilityLevel(10, "other")).toBe("inherit");
    });
  });

  describe("getTopicNotificationLevel", () => {
    it("reflects followed, muted, and unmuted-in-muted-stream overrides", () => {
      useMuteStore.getState().followTopic(10, "alerts");
      expect(useMuteStore.getState().getTopicNotificationLevel(10, "alerts")).toBe("subscribed");

      useMuteStore.getState().muteTopic(10, "noise");
      expect(useMuteStore.getState().getTopicNotificationLevel(10, "noise")).toBe("muted");

      useMuteStore.getState().muteStream(10);
      useMuteStore.getState().unmuteTopic(10, "important");
      expect(useMuteStore.getState().getTopicNotificationLevel(10, "important")).toBe("default");
      expect(useMuteStore.getState().getTopicNotificationLevel(10, "other")).toBe("muted");
    });
  });
});
